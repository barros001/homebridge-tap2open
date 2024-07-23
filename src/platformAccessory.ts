import {Service, PlatformAccessory, CharacteristicValue} from 'homebridge';

import {HomebridgePlatform} from './platform.js';

type State = {
  targetDoorState: CharacteristicValue;
  currentDoorState: CharacteristicValue;
};

export class GateAccessory {
  OPENING_TIME = 5000;
  OPEN_TIME = 3000;

  private service: Service;

  private state: State;

  constructor(
    private readonly platform: HomebridgePlatform,
    public readonly accessory: PlatformAccessory,
    public online: boolean = false,
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
        this.platform.log.debug('Current gate status:', {
          gate: this.accessory.context.gate.parameters.description,
          state: this.state.currentDoorState,
          online: this.online,
        });

        if (this.online) {
          return this.state.currentDoorState;
        }

        throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
      });

    this.service.getCharacteristic(this.platform.Characteristic.ObstructionDetected)
      .onGet(() => {
        return false;
      });

    this.closed();
  }

  async setTargetDoorState(value: CharacteristicValue): Promise<void> {
    if (value === this.platform.Characteristic.TargetDoorState.OPEN) {
      if (this.state.targetDoorState === value) {
        this.platform.log.debug(`Gate ${this.accessory.context.gate.parameters.description} is already opening, ignoring request.`);
        return;
      }

      this.platform.log.info(`Opening gate ${this.accessory.context.gate.parameters.description}...`);
      this.opening();

      try {
        await this.platform.tap2OpenClient?.openGate(this.accessory.context.gate);

        // bring it back online if it was offline
        this.online = true;

        setTimeout(() => {
          this.platform.log.info(`Gate ${this.accessory.context.gate.parameters.description} opened.`);
          this.open();

          setTimeout(() => {
            this.closed();
          }, this.OPEN_TIME);
        }, this.OPENING_TIME);
      } catch (error) {
        this.platform.log.error(`Failed to open gate ${this.accessory.context.gate.parameters.description}: ${error}`);

        // mark it as offline
        this.online = false;

        this.closed(false);
        throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
      }
    } else if (this.state.targetDoorState !== value) {
      this.platform.log.debug('Closing gate is not supported');
      setTimeout(() => {
        this.service.updateCharacteristic(
          this.platform.Characteristic.TargetDoorState,
          this.state.targetDoorState,
        );
      }, 0);
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

  closed(updateCharacteristic: boolean = true): void {
    this.state.targetDoorState = this.platform.Characteristic.TargetDoorState.CLOSED;
    this.state.currentDoorState = this.platform.Characteristic.CurrentDoorState.CLOSED;

    if (updateCharacteristic) {
      this.service.updateCharacteristic(
        this.platform.Characteristic.CurrentDoorState,
        this.platform.Characteristic.CurrentDoorState.CLOSED,
      );
      this.service.updateCharacteristic(
        this.platform.Characteristic.TargetDoorState,
        this.platform.Characteristic.TargetDoorState.CLOSED,
      );
    }
  }
}
