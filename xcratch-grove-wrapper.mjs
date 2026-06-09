import {
  blockClass as MicrobitMoreBlocks,
  entry as microbitMoreEntry
} from 'https://microbit-more.github.io/dist/microbitMore.mjs';

const EXTENSION_ID = 'groveShieldWrapper';
const EXTENSION_NAME = 'Grove Wrapper';
const EXTENSION_DESCRIPTION = 'Grove Shield for micro:bit 向けの分かりやすいラッパー';

let extensionURL = import.meta.url;
const extensionQuery = new URL(extensionURL).searchParams;
const DEBUG_ENABLED = extensionQuery.get('v') === 'debug';

const iconURL = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'%3E%3Crect width='80' height='80' rx='18' fill='%233e8b52'/%3E%3Crect x='14' y='20' width='52' height='40' rx='8' fill='%23f8f3e8'/%3E%3Ccircle cx='28' cy='40' r='6' fill='%23d97a2b'/%3E%3Ccircle cx='52' cy='40' r='6' fill='%232e6ccf'/%3E%3Cpath d='M20 14v12M32 14v12M44 14v12M56 14v12' stroke='%23f8f3e8' stroke-width='4' stroke-linecap='round'/%3E%3C/svg%3E";

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

const toPortPin = (table, portName) => table[String(portName)] || '0';
const clampAngle = angle => Math.max(0, Math.min(180, angle));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const entry = {
  name: EXTENSION_NAME,
  extensionId: EXTENSION_ID,
  extensionURL,
  collaborator: 'mnakaue',
  iconURL,
  menuIconURL: iconURL,
  insetIconURL: iconURL,
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
    this.ledButtonEventListening = {};
    if (DEBUG_ENABLED) {
      this.#installDebugHooks();
      this.#logDebug('constructor', this.#debugSnapshot());
    }
  }

  getInfo() {
    const blocks = [
      {
        opcode: 'whenConnected',
        blockType: 'hat',
        isEdgeActivated: true,
        text: 'micro:bit につながったとき'
      },
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
        isEdgeActivated: true,
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
      menuIconURI: iconURL,
      blockIconURI: iconURL,
      showStatusButton: true,
      blocks,
      menus: {
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

  whenLedButtonPressed(args, util) {
    const port = DUAL_SIGNAL_PORTS[String(args.PORT)] || DUAL_SIGNAL_PORTS.P0;
    if (!this.isConnected()) {
      this.ledButtonEventListening = {};
      return false;
    }
    if (!this.ledButtonEventListening[port.button]) {
      const resultPromise = this.base.listenPinEventType({
        EVENT_TYPE: 'ON_EDGE',
        PIN: port.button
      }, util);
      if (!resultPromise) return;
      return resultPromise.then(() => {
        this.ledButtonEventListening[port.button] = true;
        return false;
      });
    }
    return this.base.whenPinEvent({
      EVENT: 'FALL',
      PIN: port.button
    });
  }

  ledButtonPressed(args) {
    const port = DUAL_SIGNAL_PORTS[String(args.PORT)] || DUAL_SIGNAL_PORTS.P0;
    return !this.base.isPinHigh({PIN: port.button});
  }

  setLedButtonLed(args) {
    const port = DUAL_SIGNAL_PORTS[String(args.PORT)] || DUAL_SIGNAL_PORTS.P0;
    return this.base.setDigitalOut({
      PIN: port.led,
      LEVEL: String(args.STATE) === 'true' ? 'true' : 'false'
    });
  }

  readAnalog(args) {
    return this.base.getAnalogValue({
      PIN: toPortPin(ANALOG_PORTS, args.PORT)
    });
  }

  setServoAngle(args) {
    const port = String(args.PORT);
    const angle = clampAngle(Number(args.ANGLE) || 0);
    this.servoAngles[port] = angle;
    return this.#setServo(port, angle);
  }

  async moveServoAngle(args) {
    const port = String(args.PORT);
    const targetAngle = clampAngle(Number(args.ANGLE) || 0);
    const seconds = Math.max(0, Number(args.SECONDS) || 0);
    const startAngle = this.servoAngles[port] ?? DEFAULT_SERVO_ANGLE;

    if (seconds === 0 || startAngle === targetAngle) {
      this.servoAngles[port] = targetAngle;
      return this.#setServo(port, targetAngle);
    }

    const durationMs = seconds * 1000;
    const steps = Math.max(1, Math.ceil(durationMs / SERVO_MIN_STEP_MS));

    for (let step = 1; step <= steps; step += 1) {
      const ratio = step / steps;
      const angle = clampAngle(Math.round(startAngle + (targetAngle - startAngle) * ratio));
      this.servoAngles[port] = angle;
      this.#setServo(port, angle);
      if (step < steps) {
        await sleep(durationMs / steps);
      }
    }
  }

  #setServo(port, angle) {
    return this.base.setServo({
      PIN: toPortPin(SERVO_PORTS, port),
      ANGLE: angle,
      RANGE: SERVO_RANGE,
      CENTER: SERVO_CENTER
    });
  }

  #installDebugHooks() {
    this.#wrapPeripheralMethod('scan', () => this.#debugSnapshot());
    this.#wrapPeripheralMethod('scanBLE', () => this.#debugSnapshot());
    this.#wrapPeripheralMethod('scanSerial', () => this.#debugSnapshot());
    this.#wrapPeripheralMethod('connect', id => ({id, ...this.#debugSnapshot()}));
    this.#wrapPeripheralMethod('disconnect', () => this.#debugSnapshot());
    this.#wrapPeripheralMethod('onDisconnect', () => this.#debugSnapshot());
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
      self.#installBleDebugHooks();
      if (result && typeof result.then === 'function') {
        return result.then(value => {
          self.#logDebug(`${name}-resolved`, self.#debugSnapshot());
          return value;
        }).catch(error => {
          self.#logDebug(`${name}-error`, {message: String(error), ...self.#debugSnapshot()});
          throw error;
        });
      }
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
