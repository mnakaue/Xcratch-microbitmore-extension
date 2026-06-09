import {
  blockClass as MicrobitMoreBlocks,
  entry as microbitMoreEntry
} from 'https://microbit-more.github.io/dist/microbitMore.mjs';

const EXTENSION_ID = 'groveShieldWrapper';
const EXTENSION_NAME = 'Grove Wrapper';
const EXTENSION_DESCRIPTION = 'Grove Shield for micro:bit 向けの分かりやすいラッパー';
const MICROBIT_MORE_OPCODES = new Set([
  'whenConnectionChanged',
  'whenButtonEvent',
  'isButtonPressed',
  'whenTouchEvent',
  'isPinTouched',
  'whenGesture',
  'displayMatrix',
  'displayText',
  'displayClear',
  'getLightLevel',
  'getTemperature',
  'getCompassHeading',
  'getPitch',
  'getRoll',
  'getSoundLevel',
  'getMagneticForce',
  'getAcceleration',
  'playTone',
  'stopTone'
]);

let extensionURL = import.meta.url;
const extensionQuery = new URL(extensionURL).searchParams;
const DEBUG_ENABLED = extensionQuery.get('v') === 'debug';

const iconURL = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'%3E%3Crect width='80' height='80' rx='18' fill='%233e8b52'/%3E%3Crect x='14' y='20' width='52' height='40' rx='8' fill='%23f8f3e8'/%3E%3Ccircle cx='28' cy='40' r='6' fill='%23d97a2b'/%3E%3Ccircle cx='52' cy='40' r='6' fill='%232e6ccf'/%3E%3Cpath d='M20 14v12M32 14v12M44 14v12M56 14v12' stroke='%23f8f3e8' stroke-width='4' stroke-linecap='round'/%3E%3C/svg%3E";
const microbitMoreIconURI = microbitMoreEntry.insetIconURL || microbitMoreEntry.iconURL || iconURL;
const menuIconURI = microbitMoreEntry.iconURL || microbitMoreIconURI;

const DIGITAL_PORTS = {
  P0: '0',
  P1: '1',
  P2: '2'
};

const ANALOG_PORTS = {
  P0: '0',
  P1: '1',
  P2: '2'
};

const SERVO_PORTS = {
  P0: '0',
  P1: '1',
  P2: '2'
};

const DUAL_SIGNAL_PORTS = {
  P0: {led: '0', button: '14'},
  P1: {led: '1', button: '15'},
  P2: {led: '2', button: '16'}
};

const DEFAULT_SERVO_ANGLE = 90;
const SERVO_RANGE = 2000;
const SERVO_CENTER = 1500;
const SERVO_MIN_STEP_MS = 50;
const DEBUG_HISTORY_LIMIT = 12;
const PULL_NONE = 0;
const PIN_EVENT_ON_EDGE = 1;

const toPortPin = (table, portName) => table[String(portName)] || '0';
const clampAngle = angle => Math.max(0, Math.min(180, angle));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const entry = {
  name: EXTENSION_NAME,
  extensionId: EXTENSION_ID,
  extensionURL,
  collaborator: 'mnakaue',
  iconURL: menuIconURI,
  menuIconURL: menuIconURI,
  insetIconURL: microbitMoreIconURI,
  description: EXTENSION_DESCRIPTION,
  tags: ['microbit', 'grove'],
  featured: false,
  disabled: false,
  bluetoothRequired: true,
  internetConnectionRequired: false,
  launchPeripheralConnectionFlow: true,
  useAutoScan: false,
  connectionIconURL: microbitMoreEntry.connectionIconURL,
  connectionSmallIconURL: microbitMoreEntry.connectionSmallIconURL,
  helpLink: 'https://microbit-more.github.io/'
};

class GroveShieldWrapperBlocks {
  constructor(runtime) {
    this.runtime = runtime;
    this.base = new MicrobitMoreBlocks(runtime);
    this.microbit = this.base.microbit;
    this._peripheral = this.base._peripheral;
    this._peripheral._extensionId = EXTENSION_ID;
    if (this.runtime && typeof this.runtime.registerPeripheralExtension === 'function') {
      this.runtime.registerPeripheralExtension(EXTENSION_ID, this);
    }
    this.debugHistory = [];
    this.lastDebugMessage = '';
    this.servoAngles = {
      P0: DEFAULT_SERVO_ANGLE,
      P1: DEFAULT_SERVO_ANGLE,
      P2: DEFAULT_SERVO_ANGLE
    };
    this.servoMoveTokens = {
      P0: 0,
      P1: 0,
      P2: 0
    };
    this.servoActivePorts = new Set();
    this.ledStates = {
      P0: false,
      P1: false,
      P2: false
    };
    this.ledActivePorts = new Set();
    this.buttonConfigState = {};
    this.transportQueue = Promise.resolve();
    this.connectionEpoch = 0;
    this.lastConnectionState = false;
    this.#installConnectionHooks();
    this.#syncConnectionState();
    if (DEBUG_ENABLED) {
      this.#installDebugHooks();
      this.#logDebug('constructor', this.#debugSnapshot());
    }
  }

  getInfo() {
    const baseInfo = this.base.getInfo();
    const blocks = [
      {
        opcode: 'isConnected',
        blockType: 'Boolean',
        text: 'micro:bit がつながっている'
      },
      '---',
      {
        opcode: 'ledButtonPressed',
        blockType: 'Boolean',
        text: 'Grove LEDボタン [PORT] が押されている',
        arguments: {
          PORT: {
            type: 'string',
            menu: 'dualSignalPorts',
            defaultValue: 'P0'
          }
        }
      },
      {
        opcode: 'setLedButtonLed',
        blockType: 'command',
        text: 'Grove LEDボタン [PORT] のLEDを [STATE] にする',
        arguments: {
          PORT: {
            type: 'string',
            menu: 'dualSignalPorts',
            defaultValue: 'P0'
          },
          STATE: {
            type: 'string',
            menu: 'onOff',
            defaultValue: 'true'
          }
        }
      },
      {
        opcode: 'whenLedButtonPressed',
        blockType: 'hat',
        text: 'Grove LEDボタン [PORT] が押されたとき',
        arguments: {
          PORT: {
            type: 'string',
            menu: 'dualSignalPorts',
            defaultValue: 'P0'
          }
        }
      },
      {
        opcode: 'readAnalog',
        blockType: 'reporter',
        text: 'Grove アナログ [PORT] の値',
        arguments: {
          PORT: {
            type: 'string',
            menu: 'analogPorts',
            defaultValue: 'P0'
          }
        }
      },
      {
        opcode: 'setServoAngle',
        blockType: 'command',
        text: 'Grove サーボを [PORT] で [ANGLE] 度にする',
        arguments: {
          PORT: {
            type: 'string',
            menu: 'servoPorts',
            defaultValue: 'P0'
          },
          ANGLE: {
            type: 'number',
            defaultValue: 90
          }
        }
      },
      {
        opcode: 'moveServoAngle',
        blockType: 'command',
        text: 'Grove サーボを [PORT] で [SECONDS] 秒かけて [ANGLE] 度にする',
        arguments: {
          PORT: {
            type: 'string',
            menu: 'servoPorts',
            defaultValue: 'P0'
          },
          SECONDS: {
            type: 'number',
            defaultValue: 1
          },
          ANGLE: {
            type: 'number',
            defaultValue: 90
          }
        }
      }
    ];

    const microbitMoreBlocks = [];
    let pendingSeparator = false;
    baseInfo.blocks.forEach(block => {
      if (block === '---') {
        if (microbitMoreBlocks.length > 0) {
          pendingSeparator = true;
        }
        return;
      }
      if (!MICROBIT_MORE_OPCODES.has(block.opcode)) {
        return;
      }
      if (pendingSeparator && microbitMoreBlocks.length > 0) {
        microbitMoreBlocks.push('---');
      }
      pendingSeparator = false;
      microbitMoreBlocks.push(block);
    });

    if (DEBUG_ENABLED) {
      blocks.splice(2, 0,
        {
          opcode: 'getConnectionDebugInfo',
          blockType: 'reporter',
          text: '接続デバッグ状態'
        },
        {
          opcode: 'clearConnectionDebugInfo',
          blockType: 'command',
          text: '接続デバッグを消す'
        }
      );
    }

    return {
      id: EXTENSION_ID,
      name: EXTENSION_NAME,
      extensionURL,
      menuIconURI,
      blockIconURI: microbitMoreIconURI,
      showStatusButton: true,
      blocks: [...microbitMoreBlocks, '---', ...blocks],
      menus: {
        ...baseInfo.menus,
        digitalPorts: {
          acceptReporters: false,
          items: ['P0', 'P1', 'P2']
        },
        analogPorts: {
          acceptReporters: false,
          items: ['P0', 'P1', 'P2']
        },
        servoPorts: {
          acceptReporters: false,
          items: ['P0', 'P1', 'P2']
        },
        dualSignalPorts: {
          acceptReporters: false,
          items: ['P0', 'P1', 'P2']
        },
        onOff: {
          acceptReporters: false,
          items: [
            {text: 'オン', value: 'true'},
            {text: 'オフ', value: 'false'}
          ]
        }
      }
    };
  }

  isConnected() {
    return Boolean(this._peripheral && this._peripheral.isConnected());
  }

  whenConnectionChanged(args) {
    return this.base.whenConnectionChanged(args);
  }

  whenConnected() {
    return this.isConnected();
  }

  getConnectionDebugInfo() {
    if (!DEBUG_ENABLED) return '';
    return this.lastDebugMessage || 'debug-empty';
  }

  clearConnectionDebugInfo() {
    if (!DEBUG_ENABLED) return;
    this.debugHistory = [];
    this.lastDebugMessage = '';
    this.#logDebug('debug-cleared', this.#debugSnapshot());
  }

  scan() {
    if (DEBUG_ENABLED) {
      this.#logDebug('scan-called', this.#debugSnapshot());
    }
    return this._peripheral.scan();
  }

  connect(id) {
    if (DEBUG_ENABLED) {
      this.#logDebug('connect-called', {id, ...this.#debugSnapshot()});
    }
    return this._peripheral.connect(id);
  }

  disconnect() {
    if (DEBUG_ENABLED) {
      this.#logDebug('disconnect-called', this.#debugSnapshot());
    }
    return this._peripheral.disconnect();
  }

  whenLedButtonPressed(args) {
    const portName = this.#normalizePortName(args.PORT, DUAL_SIGNAL_PORTS);
    const port = DUAL_SIGNAL_PORTS[portName];
    this.#ensureLedButtonReady(portName).catch(() => {});
    return this.base.whenPinEvent({
      PIN: port.button,
      EVENT: 'FALL'
    });
  }

  whenButtonEvent(args) {
    return this.base.whenButtonEvent(args);
  }

  isButtonPressed(args) {
    return this.base.isButtonPressed(args);
  }

  whenTouchEvent(args, util) {
    return this.base.whenTouchEvent(args, util);
  }

  isPinTouched(args, util) {
    return this.base.isPinTouched(args, util);
  }

  whenGesture(args) {
    return this.base.whenGesture(args);
  }

  ledButtonPressed(args) {
    const portName = this.#normalizePortName(args.PORT, DUAL_SIGNAL_PORTS);
    const port = DUAL_SIGNAL_PORTS[portName];
    this.#ensureLedButtonReady(portName).catch(() => {});
    if (!this.isConnected()) {
      return false;
    }
    return !this.microbit.isPinHigh(Number(port.button));
  }

  async setLedButtonLed(args) {
    const portName = this.#normalizePortName(args.PORT, DUAL_SIGNAL_PORTS);
    const state = String(args.STATE) === 'true';
    const port = DUAL_SIGNAL_PORTS[portName];
    this.ledStates[portName] = state;
    this.ledActivePorts.add(portName);
    await this.#sendTransportCommand(async () => {
      await this.#waitForTransportReady();
      return this.microbit.setPinOutput(Number(port.led), state);
    });
  }

  readAnalog(args) {
    return this.base.getAnalogValue({
      PIN: toPortPin(ANALOG_PORTS, args.PORT)
    });
  }

  displayMatrix(args, util) {
    return this.base.displayMatrix(args, util);
  }

  displayText(args, util) {
    return this.base.displayText(args, util);
  }

  displayClear() {
    return this.base.displayClear();
  }

  getLightLevel() {
    return this.base.getLightLevel();
  }

  getTemperature() {
    return this.base.getTemperature();
  }

  getCompassHeading() {
    return this.base.getCompassHeading();
  }

  getPitch() {
    return this.base.getPitch();
  }

  getRoll() {
    return this.base.getRoll();
  }

  getSoundLevel() {
    return this.base.getSoundLevel();
  }

  getMagneticForce(args) {
    return this.base.getMagneticForce(args);
  }

  getAcceleration(args) {
    return this.base.getAcceleration(args);
  }

  async setServoAngle(args) {
    const port = this.#normalizePortName(args.PORT, SERVO_PORTS);
    const angle = clampAngle(Number(args.ANGLE) || 0);
    this.servoAngles[port] = angle;
    this.servoActivePorts.add(port);
    this.servoMoveTokens[port] += 1;
    await this.#setServo(port, angle);
  }

  async moveServoAngle(args) {
    const port = this.#normalizePortName(args.PORT, SERVO_PORTS);
    const targetAngle = clampAngle(Number(args.ANGLE) || 0);
    const seconds = Math.max(0, Number(args.SECONDS) || 0);
    const startAngle = this.servoAngles[port] ?? DEFAULT_SERVO_ANGLE;
    const moveToken = this.#nextServoMoveToken(port);
    this.servoActivePorts.add(port);

    if (seconds === 0 || startAngle === targetAngle) {
      this.servoAngles[port] = targetAngle;
      await this.#setServo(port, targetAngle);
      return;
    }

    const durationMs = seconds * 1000;
    const steps = Math.max(1, Math.ceil(durationMs / SERVO_MIN_STEP_MS));
    const connectionEpoch = this.connectionEpoch;

    for (let step = 1; step <= steps; step += 1) {
      if (!this.isConnected()) {
        return;
      }
      if (this.connectionEpoch !== connectionEpoch) {
        return;
      }
      if (this.servoMoveTokens[port] !== moveToken) {
        return;
      }
      const ratio = step / steps;
      const angle = clampAngle(Math.round(startAngle + (targetAngle - startAngle) * ratio));
      this.servoAngles[port] = angle;
      await this.#setServo(port, angle);
      if (step < steps) {
        await sleep(durationMs / steps);
      }
    }
  }

  playTone(args, util) {
    return this.base.playTone(args, util);
  }

  stopTone() {
    return this.base.stopTone();
  }

  async #setServo(port, angle) {
    const pin = Number(toPortPin(SERVO_PORTS, port));
    await this.#sendTransportCommand(async () => {
      await this.#waitForTransportReady();
      return this.microbit.setPinServo(pin, angle, SERVO_RANGE, SERVO_CENTER);
    });
  }

  #normalizePortName(portName, table) {
    const name = String(portName);
    if (table[name]) {
      return name;
    }
    return Object.keys(table)[0];
  }

  #nextServoMoveToken(port) {
    this.servoMoveTokens[port] = (this.servoMoveTokens[port] || 0) + 1;
    return this.servoMoveTokens[port];
  }

  #ensureLedButtonReady(portName) {
    if (!this.isConnected()) {
      return Promise.resolve();
    }
    const epoch = this.connectionEpoch;
    const state = this.buttonConfigState[portName];
    if (state && state.epoch === epoch) {
      return state.promise;
    }
    const port = DUAL_SIGNAL_PORTS[portName];
    const promise = this.#sendTransportCommand(async () => {
      await this.#waitForTransportReady();
      await this.microbit.setPullMode(Number(port.button), PULL_NONE);
      await this.#waitForTransportReady();
      return this.microbit.listenPinEventType(Number(port.button), PIN_EVENT_ON_EDGE);
    });
    this.buttonConfigState[portName] = {epoch, promise};
    return promise.catch(error => {
      if (this.buttonConfigState[portName] && this.buttonConfigState[portName].epoch === epoch) {
        delete this.buttonConfigState[portName];
      }
      throw error;
    });
  }

  async #waitForTransportReady() {
    while (this.isConnected() && this.microbit && this.microbit.bleBusy) {
      await sleep(10);
    }
  }

  #sendTransportCommand(task) {
    const epoch = this.connectionEpoch;
    const run = async () => {
      if (!this.isConnected() || this.connectionEpoch !== epoch) {
        return;
      }
      return task();
    };
    const result = this.transportQueue.then(run, run);
    this.transportQueue = result.catch(() => {});
    return result;
  }

  #installConnectionHooks() {
    this.#wrapPeripheralMethod('connect', id => ({id, ...this.#debugSnapshot()}));
    this.#wrapPeripheralMethod('disconnect', () => this.#debugSnapshot());
    this.#wrapPeripheralMethod('onDisconnect', () => this.#debugSnapshot());
    this.#installRuntimeConnectionHooks();
  }

  #installRuntimeConnectionHooks() {
    if (!this.runtime || typeof this.runtime.on !== 'function') {
      return;
    }
    const eventNames = [
      'PERIPHERAL_CONNECTED',
      'PERIPHERAL_DISCONNECTED'
    ];
    eventNames.forEach(name => {
      const eventName = this.runtime.constructor && this.runtime.constructor[name];
      if (!eventName) return;
      this.runtime.on(eventName, () => {
        this.#syncConnectionState();
      });
    });
  }

  #syncConnectionState() {
    const connected = this.isConnected();
    if (connected === this.lastConnectionState) {
      return;
    }
    this.lastConnectionState = connected;
    this.connectionEpoch += 1;
    this.transportQueue = Promise.resolve();
    Object.keys(this.servoMoveTokens).forEach(port => {
      this.servoMoveTokens[port] += 1;
    });
    this.buttonConfigState = {};
    if (connected) {
      this.#primeGroveState(this.connectionEpoch).catch(error => {
        if (DEBUG_ENABLED) {
          this.#logDebug('prime-grove-state-error', {message: String(error)});
        }
      });
    }
  }

  async #primeGroveState(epoch) {
    const ports = Object.keys(DUAL_SIGNAL_PORTS);
    for (const portName of ports) {
      if (epoch !== this.connectionEpoch || !this.isConnected()) {
        return;
      }
      await this.#ensureLedButtonReady(portName);
    }
    for (const portName of this.ledActivePorts) {
      if (epoch !== this.connectionEpoch || !this.isConnected()) {
        return;
      }
      const port = DUAL_SIGNAL_PORTS[portName];
      const state = this.ledStates[portName];
      await this.#sendTransportCommand(async () => {
        await this.#waitForTransportReady();
        return this.microbit.setPinOutput(Number(port.led), state);
      });
    }
    for (const portName of this.servoActivePorts) {
      if (epoch !== this.connectionEpoch || !this.isConnected()) {
        return;
      }
      await this.#setServo(portName, this.servoAngles[portName]);
    }
  }

  #installDebugHooks() {
    this.#wrapPeripheralMethod('scan', () => this.#debugSnapshot());
    this.#wrapPeripheralMethod('scanBLE', () => this.#debugSnapshot());
    this.#wrapPeripheralMethod('scanSerial', () => this.#debugSnapshot());
    this.#installRuntimeHooks();
  }

  #installRuntimeHooks() {
    if (!this.runtime || typeof this.runtime.on !== 'function') {
      return;
    }

    const eventNames = [
      'PERIPHERAL_LIST_UPDATE',
      'USER_PICKED_PERIPHERAL',
      'PERIPHERAL_CONNECTED',
      'PERIPHERAL_DISCONNECTED',
      'PERIPHERAL_REQUEST_ERROR'
    ];

    eventNames.forEach(name => {
      const eventName = this.runtime.constructor && this.runtime.constructor[name];
      if (!eventName) return;
      this.runtime.on(eventName, payload => {
        this.#logDebug(`runtime-${name.toLowerCase()}`, {
          payload: this.#safeSerialize(payload),
          ...this.#debugSnapshot()
        });
      });
    });
  }

  #wrapPeripheralMethod(name, detailFactory) {
    const original = this._peripheral && this._peripheral[name];
    if (typeof original !== 'function' || original.__groveWrapped) {
      return;
    }

    const self = this;
    const wrapped = function (...args) {
      self.#logDebug(`${name}-start`, detailFactory ? detailFactory(...args) : args);
      const result = original.apply(this, args);
      self.#syncConnectionState();
      self.#installBleDebugHooks();
      if (result && typeof result.then === 'function') {
        return result.then(value => {
          self.#syncConnectionState();
          self.#logDebug(`${name}-resolved`, self.#debugSnapshot());
          return value;
        }).catch(error => {
          self.#syncConnectionState();
          self.#logDebug(`${name}-error`, {message: String(error), ...self.#debugSnapshot()});
          throw error;
        });
      }
      self.#syncConnectionState();
      self.#logDebug(`${name}-done`, self.#debugSnapshot());
      return result;
    };
    wrapped.__groveWrapped = true;
    this._peripheral[name] = wrapped;
  }

  #installBleDebugHooks() {
    const connector = this._peripheral && this._peripheral._ble;
    if (!connector) {
      return;
    }
    this.#wrapBleMethod(connector, 'requestPeripheral');
    this.#wrapBleMethod(connector, 'connectPeripheral');
    this.#wrapBleMethod(connector, 'disconnect');
  }

  #wrapBleMethod(connector, name) {
    const original = connector && connector[name];
    if (typeof original !== 'function' || original.__groveWrapped) {
      return;
    }

    const self = this;
    const wrapped = function (...args) {
      self.#logDebug(`ble-${name}-start`, {
        args: self.#safeSerialize(args),
        connector: connector.constructor ? connector.constructor.name : 'unknown',
        ...self.#debugSnapshot()
      });
      const result = original.apply(this, args);
      if (result && typeof result.then === 'function') {
        return result.then(value => {
          self.#logDebug(`ble-${name}-resolved`, self.#debugSnapshot());
          return value;
        }).catch(error => {
          self.#logDebug(`ble-${name}-error`, {message: String(error), ...self.#debugSnapshot()});
          throw error;
        });
      }
      self.#logDebug(`ble-${name}-done`, self.#debugSnapshot());
      return result;
    };
    wrapped.__groveWrapped = true;
    connector[name] = wrapped;
  }

  #debugSnapshot() {
    const connector = this._peripheral && this._peripheral._ble;
    return {
      runtimeHasRegisterPeripheralExtension:
        Boolean(this.runtime && typeof this.runtime.registerPeripheralExtension === 'function'),
      extensionId: this._peripheral ? this._peripheral._extensionId : 'no-peripheral',
      bleType: connector && connector.constructor ? connector.constructor.name : 'none',
      hasBle: Boolean(connector),
      isConnected: this.isConnected(),
      hasNavigatorBluetooth: typeof navigator !== 'undefined' && Boolean(navigator.bluetooth),
      hasNavigatorSerial: typeof navigator !== 'undefined' && Boolean(navigator.serial)
    };
  }

  #safeSerialize(value) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return String(value);
    }
  }

  #logDebug(label, detail) {
    if (!DEBUG_ENABLED) {
      return;
    }
    const line = `${new Date().toISOString()} ${label} ${JSON.stringify(this.#safeSerialize(detail))}`;
    this.lastDebugMessage = line;
    this.debugHistory.push(line);
    if (this.debugHistory.length > DEBUG_HISTORY_LIMIT) {
      this.debugHistory.shift();
    }
    console.log(`[GroveWrapper] ${line}`);
    if (typeof window !== 'undefined') {
      window.__groveWrapperDebug = [...this.debugHistory];
    }
  }

  static get EXTENSION_NAME() {
    return EXTENSION_NAME;
  }

  static get EXTENSION_ID() {
    return EXTENSION_ID;
  }

  static get extensionURL() {
    return extensionURL;
  }

  static set extensionURL(url) {
    extensionURL = url;
  }
}

export {GroveShieldWrapperBlocks as blockClass, entry};
