import {Service, PlatformAccessory, CharacteristicValue} from 'homebridge';

import {HomebridgePlatform} from './platform.js';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class GateAccessory {
  private service: Service;

  /**
   * These are just used to create a working example
   * You should implement your own code to track the state of your accessory
   */
  private state = {
    opening: false,
  };

  constructor(
    private readonly platform: HomebridgePlatform,
    private readonly accessory: PlatformAccessory,
  ) {

    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Tap2Open')
      .setCharacteristic(this.platform.Characteristic.Model, 'Gate')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, accessory.context.gate.gate_id.toString());

    // get the Switch service if it exists, otherwise create a new Switch service
    // you can create multiple services for each accessory
    this.service = this.accessory.getService(this.platform.Service.Switch) || this.accessory.addService(this.platform.Service.Switch);

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.gate.parameters.description);

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/Switch

    // register handlers for the On/Off Characteristic
    this.service.getCharacteristic(this.platform.Characteristic.On)
      .onSet(this.setOn.bind(this))                // SET - bind to the `setOn` method below
      .onGet(this.getOn.bind(this));               // GET - bind to the `getOn` method below
  }

  /**
   * Handle "SET" requests from HomeKit
   * These are sent when the user changes the state of an accessory, for example, turning on a Light bulb.
   */
  async setOn(value: CharacteristicValue) {
    if (this.state.opening) {
      this.platform.log.info('Gate is opening, ignoring request');

      setTimeout(() => {
        this.service.updateCharacteristic(this.platform.Characteristic.On, true);
      }, 0);

      return;
    }

    if (value) {
      this.platform.log.debug(`Opening gate ${this.accessory.context.gate.parameters.description}`);

      this.state.opening = true;
      try {
        await this.platform.tap2OpenClient?.openGate(this.accessory.context.gate);
        setTimeout(() => {
          this.service.updateCharacteristic(this.platform.Characteristic.On, false);
          this.state.opening = false;
        }, 5000);
      } catch (error) {
        this.platform.log.error('Failed to open gate:', error);
        this.state.opening = false;
        this.service.updateCharacteristic(this.platform.Characteristic.On, false);
      }
    }
  }

  /**
   * Handle the "GET" requests from HomeKit
   * These are sent when HomeKit wants to know the current state of the accessory, for example, checking if a Light bulb is on.
   *
   * GET requests should return as fast as possible. A long delay here will result in
   * HomeKit being unresponsive and a bad user experience in general.
   *
   * If your device takes time to respond you should update the status of your device
   * asynchronously instead using the `updateCharacteristic` method instead.

   * @example
   * this.service.updateCharacteristic(this.platform.Characteristic.On, true)
   */
  async getOn(): Promise<CharacteristicValue> {
    return this.state.opening;
  }
}
