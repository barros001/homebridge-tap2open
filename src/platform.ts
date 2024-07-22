import {API, DynamicPlatformPlugin, Logging, PlatformAccessory, PlatformConfig, Service, Characteristic} from 'homebridge';
import Tap2Open from './lib/tap2open.js';

import {PLATFORM_NAME, PLUGIN_NAME} from './settings.js';
import {GateAccessory} from './platformAccessory.js';

export class HomebridgePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;

  public readonly accessories: PlatformAccessory[] = [];

  public tap2OpenClient: Tap2Open | null = null;

  constructor(
    public readonly log: Logging,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;

    this.log.debug('Finished initializing platform:', this.config.name);

    if (!log.success) {
      log.success = log.info;
    }

    this.api.on('didFinishLaunching', () => {
      log.debug('Executed didFinishLaunching callback');
      this.discoverGates();
    });
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the accessories cache, so we can track if it has already been registered
    this.accessories.push(accessory);
  }

  async discoverGates() {
    if (!this.config.username || !this.config.password) {
      this.log.error(`Plugin ${this.config.name} not configured.`);
      return;
    }

    this.tap2OpenClient = new Tap2Open({
      username: this.config.username,
      password: this.config.password,
    });

    let gates;

    try {
      gates = await this.tap2OpenClient.listGates();
    } catch (error) {
      this.log.error('Failed to discover gates:', error);
      return;
    }

    for (const gate of gates) {
      const uuid = this.api.hap.uuid.generate(gate.gate_id.toString());
      const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

      if (existingAccessory) {
        this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);
        new GateAccessory(this, existingAccessory);
      } else {
        this.log.info('Adding new gate:', gate.parameters.description);

        const accessory = new this.api.platformAccessory(gate.parameters.description, uuid);
        accessory.context.gate = gate;
        new GateAccessory(this, accessory);

        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }
  }
}
