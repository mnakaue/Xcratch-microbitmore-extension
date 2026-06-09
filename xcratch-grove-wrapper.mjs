import {
  blockClass as MicrobitMoreBlocks,
  entry as microbitMoreEntry
} from 'https://microbit-more.github.io/dist/microbitMore.mjs';

const EXTENSION_ID = 'groveShieldWrapper';
const EXTENSION_NAME = 'Grove Wrapper';
const EXTENSION_DESCRIPTION = 'Grove Shield for micro:bit 向けの分かりやすいラッパー';

let extensionURL = import.meta.url;

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

const DEFAULT_SERVO_ANGLE = 90;
const SERVO_RANGE = 2000;
const SERVO_CENTER = 1500;
const SERVO_MIN_STEP_MS = 50;

const toPortPin = (table, portName) => table[String(portName)] || '0';
const clampAngle = angle => Math.max(0, Math.min(180, angle));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const entry = {
  name: EXTENSION_NAME,
  extensionId: EXTENSION_ID,
  extensionURL,
  collaborator: 'mnakaue',
  iconURL,
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
    this.servoAngles = {
      P0: DEFAULT_SERVO_ANGLE,
      P1: DEFAULT_SERVO_ANGLE,
      P2: DEFAULT_SERVO_ANGLE
    };
  }

  getInfo() {
    return {
      id: EXTENSION_ID,
      name: EXTENSION_NAME,
      extensionURL,
      blockIconURI: iconURL,
      showStatusButton: true,
      blocks: [
        {
          opcode: 'isConnected',
          blockType: 'boolean',
          text: 'micro:bit がつながっている'
        },
        '---',
        {
          opcode: 'buttonPressed',
          blockType: 'boolean',
          text: 'Grove ボタン [PORT] が押されている',
          arguments: {
            PORT: {
              type: 'string',
              menu: 'digitalPorts',
              defaultValue: 'P0'
            }
          }
        },
        {
          opcode: 'setLed',
          blockType: 'command',
          text: 'Grove LED を [PORT] で [STATE] にする',
          arguments: {
            PORT: {
              type: 'string',
              menu: 'digitalPorts',
              defaultValue: 'P1'
            },
            STATE: {
              type: 'string',
              menu: 'onOff',
              defaultValue: 'true'
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
              defaultValue: 'P2'
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
              defaultValue: 'P2'
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
      ],
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
    return Boolean(this.base && this.base._peripheral && this.base._peripheral.isConnected());
  }

  buttonPressed(args) {
    return this.base.isPinHigh({
      PIN: toPortPin(DIGITAL_PORTS, args.PORT)
    });
  }

  setLed(args) {
    return this.base.setDigitalOut({
      PIN: toPortPin(DIGITAL_PORTS, args.PORT),
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
