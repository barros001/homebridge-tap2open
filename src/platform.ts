import {API, Characteristic, DynamicPlatformPlugin, Logging, PlatformAccessory, PlatformConfig, Service} from 'homebridge';
import Tap2Open, {Event, Tap2OpenError} from './lib/tap2open.js';

import {PLATFORM_NAME, PLUGIN_NAME} from './settings.js';
import {GateAccessory} from './platformAccessory.js';

export class HomebridgePlatform implements DynamicPlatformPlugin {
  MINIMUM_RECONNECT_INTERVAL: number = 30;

  public readonly Service: typeof Service;

  public readonly Characteristic: typeof Characteristic;

  public readonly accessories: GateAccessory[] = [];

  public tap2OpenClient: Tap2Open;

  constructor(
    public readonly log: Logging,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;
    this.tap2OpenClient = new Tap2Open({
      username: config.username,
      password: config.password,
    });

    log.debug('Finished initializing platform:', config.name);

    if (!log.success) {
      log.success = log.info;
    }

    this.api.on('didFinishLaunching', async () => {
      log.debug('Executed didFinishLaunching callback');
      await this.initialize();
    });
  }

  public configureAccessory(accessory: PlatformAccessory): void {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    this.accessories.push(new GateAccessory(this, accessory));
  }

  private async initialize(): Promise<void> {
    if (!this.config.username || !this.config.password || !this.config.reconnectInterval) {
      this.log.error('Platform not configured:', this.config.name);
      return;
    }

    try {
      await this.discoverGates();

      this.tap2OpenClient.on(Event.ERROR, (error?: Tap2OpenError) => {
        setTimeout(() => {
          this.log.error('Received error event:', error);
          this.reconnectIn(0);
        }, 0);
      });
    } catch (e) {
      this.log.error('Error while initializing platform:', e);
      this.reconnectIn(Math.max(this.MINIMUM_RECONNECT_INTERVAL, this.config.reconnectInterval));
    }
  }

  private reconnectIn(seconds: number): void {
    this.log.info('Reconnecting in %d seconds...', seconds);

    this.tap2OpenClient
      .off()
      .logout();

    this.bringAllGatesOffline();

    setTimeout(async () => {
      this.log.info('Reconnecting...');
      await this.initialize();
    }, seconds * 1000);
  }

  private async discoverGates(): Promise<void> {
    const gates = await this.tap2OpenClient.listGates();

    for (const gate of gates) {
      const uuid = this.api.hap.uuid.generate(gate.gate_id.toString());
      const existingAccessory = this.accessories.find(gateAccessory => gateAccessory.accessory.UUID === uuid);

      if (existingAccessory) {
        this.log.info('Restoring existing gate from cache:', existingAccessory.accessory.displayName);
        existingAccessory.online = true;
      } else {
        this.log.info('Adding new gate:', gate.parameters.description);

        const accessory = new this.api.platformAccessory(gate.parameters.description, uuid);
        accessory.context.gate = gate;
        this.accessories.push(new GateAccessory(this, accessory, true));

        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }
  }

  private bringAllGatesOffline(): void {
    for (const accessory of this.accessories) {
      accessory.online = false;
    }
  }
}
