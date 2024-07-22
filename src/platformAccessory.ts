import {Service, PlatformAccessory, CharacteristicValue} from 'homebridge';

import {HomebridgePlatform} from './platform.js';

type State = {
  targetDoorState: CharacteristicValue;
  currentDoorState: CharacteristicValue;
};

export class GateAccessory {
  private service: Service;

  private state: State;

  constructor(
    private readonly platform: HomebridgePlatform,
    private readonly accessory: PlatformAccessory,
  ) {

    this.state = {
      targetDoorState: this.platform.Characteristic.TargetDoorState.CLOSED,
      currentDoorState: this.platform.Characteristic.CurrentDoorState.CLOSED,
    };

    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Tap2Open')
      .setCharacteristic(this.platform.Characteristic.Model, 'Gate')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, accessory.context.gate.gate_id.toString());

    this.service = this.accessory.getService(this.platform.Service.GarageDoorOpener) ||
      this.accessory.addService(this.platform.Service.GarageDoorOpener);

    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.gate.parameters.description);

    this.service.getCharacteristic(this.platform.Characteristic.TargetDoorState)
      .onSet(this.setTargetDoorState.bind(this))
      .onGet(this.getTargetDoorState.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.CurrentDoorState)
      .onGet(() => {
        return this.state.currentDoorState;
      });

    this.service.getCharacteristic(this.platform.Characteristic.ObstructionDetected)
      .onGet(() => {
        return false;
      });
  }

  async setTargetDoorState(value: CharacteristicValue): Promise<void> {
    if (this.state.targetDoorState !== this.platform.Characteristic.TargetDoorState.CLOSED) {
      this.platform.log.debug(`Gate ${this.accessory.context.gate.parameters.description} is already opening, ignoring request.`);

      setTimeout(() => {
        this.service.updateCharacteristic(this.platform.Characteristic.TargetDoorState, this.platform.Characteristic.TargetDoorState.OPEN);
      }, 0);

      return;
    }

    if (value === this.platform.Characteristic.TargetDoorState.OPEN) {
      this.platform.log.info(`Opening gate ${this.accessory.context.gate.parameters.description}...`);

      this.opening();

      try {
        await this.platform.tap2OpenClient?.openGate(this.accessory.context.gate);

        setTimeout(() => {
          this.platform.log.debug(`Gate ${this.accessory.context.gate.parameters.description} opened.`);
          this.open();

          setTimeout(() => {
            this.closed();
          }, 3000);
        }, 5000);
      } catch (error) {
        this.platform.log.error(`Failed to open gate ${this.accessory.context.gate.parameters.description}: ${error}`);
        this.closed();
      }
    }
  }

  async getTargetDoorState(): Promise<CharacteristicValue> {
    return this.state.targetDoorState;
  }

  opening(): void {
    this.state.targetDoorState = this.platform.Characteristic.TargetDoorState.OPEN;
    this.state.currentDoorState = this.platform.Characteristic.CurrentDoorState.OPENING;
  }

  open(): void {
    this.state.currentDoorState = this.platform.Characteristic.CurrentDoorState.OPEN;
    this.service.updateCharacteristic(this.platform.Characteristic.CurrentDoorState, this.platform.Characteristic.CurrentDoorState.OPEN);
  }

  closed(): void {
    this.state.targetDoorState = this.platform.Characteristic.TargetDoorState.CLOSED;
    this.state.currentDoorState = this.platform.Characteristic.CurrentDoorState.CLOSED;
    this.service.updateCharacteristic(this.platform.Characteristic.CurrentDoorState, this.platform.Characteristic.CurrentDoorState.CLOSED);
    this.service.updateCharacteristic(this.platform.Characteristic.TargetDoorState, this.platform.Characteristic.TargetDoorState.CLOSED);
  }
}
