import type { API, Characteristic, DynamicPlatformPlugin, Logging, PlatformAccessory, PlatformConfig, Service } from 'homebridge';
//import { setTimeout } from 'timers/promises';
import cron from 'node-cron';
import { EmporiaVueVirtualSwitchAccessory } from './platformAccessory.js';
import { EmporiaVueIntegration } from './emporia.js';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';

interface EmporiaVuePluginConfig extends PlatformConfig {
  emporiaVueUsername?: string;
  emporiaVuePassword?: string;
  emporiaVueChannelName?: string;
  refreshIntervalMinutes?: number;
  printInterval?: number;
}
/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class EmporiaVueVirtualSwitchPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: Map<string, PlatformAccessory> = new Map();
  public readonly discoveredCacheUUIDs: string[] = [];

  // This is only required when using Custom Services and Characteristics not support by HomeKit
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public readonly CustomServices: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public readonly CustomCharacteristics: any;

  // Emporia Vue integration
  private emporia: EmporiaVueIntegration;

  // Peak, Pre-Peak and Pre-Pre-Peak Handlers
  private handler?: EmporiaVueVirtualSwitchAccessory;

  constructor(
    public readonly log: Logging,
    public readonly config: EmporiaVuePluginConfig,
    public readonly api: API,
  ) {
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;

    // make sure the refresh interval is between 1 and 59 minutes
    const refreshMinutes = Math.min(Math.max(this.config.refreshIntervalMinutes || 15, 1), 59);
    this.log.info('Emporia Vue Power Log Plugin Loaded');
    //this.log.info(`Config "emporiaVueUsername" --> ${this.maskValue(this.config.emporiaVueUsername)}`);
    //this.log.info(`Config "emporiaVuePassword" --> ${this.maskValue(this.config.emporiaVuePassword)}`);
    this.log.info(`Config "emporiaVueChannelName" --> ${this.config.emporiaVueChannelName}`);
    this.log.info(`Config "refreshIntervalMinutes" --> ${refreshMinutes}`);
    // set up the Emporia Vue integration
    this.emporia = new EmporiaVueIntegration(
      this.config.emporiaVueChannelName || 'Unknown Channel',
      refreshMinutes,
      this.config.emporiaVueUsername || '--NoUsernameSet--',
      this.config.emporiaVuePassword || '--NoPasswordSet--',
      this.log);

    this.log.debug('Finished initializing platform:', this.config.name);

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on('didFinishLaunching', () => {
      log.debug('Executed didFinishLaunching callback');
      // run the method to discover / register your devices as accessories
      this.discoverDevices();
      // setup scheduled state updates
      this.setupCronSchedules();
    });
  }
  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to set up event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the accessories cache, so we can track if it has already been registered
    this.accessories.set(accessory.UUID, accessory);
  }
  
  /**
   * This is an example method showing how to register discovered accessories.
   * Accessories must only be registered once, previously created accessories
   * must not be registered again to prevent "duplicate UUID" errors.
   */
  discoverDevices() {
    // EXAMPLE ONLY
    // A real plugin you would discover accessories from the local network, cloud services
    // or a user-defined array in the platform config.
    const devices = [
      {
        uniqueId: 'emporia-vue-power-log-main',
        displayName: 'Emporia Vue Power Log',
      },
    ];
    // loop over the discovered devices and register each one if it has not already been registered
    for (const device of devices) {
      // generate a unique id for the accessory this should be generated from
      // something globally unique, but constant, for example, the device serial
      // number or MAC address
      const uuid = this.api.hap.uuid.generate(device.uniqueId);
      // see if an accessory with the same uuid has already been registered and restored from
      // the cached devices we stored in the `configureAccessory` method above
      const existingAccessory = this.accessories.get(uuid);
      if (existingAccessory) {
        // the accessory already exists
        this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);
        // create the accessory handler for the restored accessory
        this.handler = new EmporiaVueVirtualSwitchAccessory(this, existingAccessory, this.emporia);
      } else {
        // the accessory does not yet exist, so we need to create it
        this.log.info('Adding new accessory:', device.displayName);
        // create a new accessory
        const accessory = new this.api.platformAccessory(device.displayName, uuid);
        // store a copy of the device object in the `accessory.context`
        // the `context` property can be used to store any data about the accessory you may need
        accessory.context.device = device;
        // create the accessory handler for the newly create accessory
        // this is imported from `platformAccessory.ts`
        this.handler = new EmporiaVueVirtualSwitchAccessory(this, accessory, this.emporia);
        // link the accessory to your platform
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
      // push into discoveredCacheUUIDs
      this.discoveredCacheUUIDs.push(uuid);
    }
    // you can also deal with accessories from the cache which are no longer present by removing them from Homebridge
    // for example, if your plugin logs into a cloud account to retrieve a device list, and a user has previously removed a device
    // from this cloud account, then this device will no longer be present in the device list but will still be in the Homebridge cache
    for (const [uuid, accessory] of this.accessories) {
      if (!this.discoveredCacheUUIDs.includes(uuid)) {
        this.log.info('Removing existing accessory from cache:', accessory.displayName);
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }
  }
  setupCronSchedules() {
    const schedules = this.emporia.getCronSchedules();
    schedules.forEach(schedule => {
      cron.schedule(schedule, async () => {
        try {
          await this.performScheduledAccessoriesStateUpdate();
        } catch (e) {
          this.log.error('Error running CRON scheduled state update', e);
        }
      }, {
        timezone: 'America/New_York',
      });
    });
  }

  async performScheduledAccessoriesStateUpdate() : Promise<void> {
    await this.handler?.updateState();
  }

  // Helper function to mask sensitive values
  maskValue(value?: string, visible: number = 2): string {
    if (!value) {
      return '';
    }
    // if length is less than or equal to visible * 2, return the value entirely masked
    if (value.length <= visible * 2) {
      return '*'.repeat(value.length);
    }
    // otherwise, mask the middle part of the value
    return value.slice(0, visible) + '*'.repeat(value.length - visible * 2) + value.slice(-visible);
  }
}
