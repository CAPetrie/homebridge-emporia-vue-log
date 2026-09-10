import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';

import type { EmporiaVueVirtualSwitchPlatform } from './platform.js';
import { EmporiaVueIntegration } from './emporia.js';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class EmporiaVueVirtualSwitchAccessory {
  private service: Service;

  /**
   * State tracking of the accessory
   */
  private state = {
    isOn: false,
    printCount: 0 as number,
    watts: 0 as number,
    powerHistory: [] as number[],
  };

  constructor(
    private readonly platform: EmporiaVueVirtualSwitchPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly emporia: EmporiaVueIntegration,
  ) {
    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Default-Manufacturer')
      .setCharacteristic(this.platform.Characteristic.Model, 'Default-Model')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, 'Default-Serial');

    // get the Switch service if it exists, otherwise create a new Switch service
    //this.service = this.accessory.getService(this.platform.Service.Switch) || this.accessory.addService(this.platform.Service.Switch);
    this.service = this.accessory.getService(this.platform.Service.LightSensor) || this.accessory.addService(this.platform.Service.LightSensor);
    // set the service name, this is what is displayed as the default name on the Home app
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.displayName);

    // register handlers for the On/Off Characteristic
    this.service.getCharacteristic(this.platform.Characteristic.On)
      .onSet(this.setOn.bind(this)) // SET - bind to the `setOn` method below
      .onGet(this.getOn.bind(this)); // GET - bind to the `getOn` method below
    // initial state update on startup (not awaited, will complete in the background)
    this.updateState(true);
  }

  /**
   * Handle "SET" requests from HomeKit
   * These are sent when the user changes the state of an accessory.
   */
  async setOn() {
    // nop - can't change this accessory's state
  }

  /**
   * Handle the "GET" requests from HomeKit
   * These are sent when HomeKit wants to know the current state of the accessory.
   */
  async getOn(): Promise<CharacteristicValue> {
    return this.state.isOn;
  }
  // Update the state of the switch
  async updateState(init: boolean = false) {
    const printInterval = this.platform.config.printInterval ?? 10;
    const powerThreshold = this.platform.config.powerThreshold ?? 450;
    const currentWatts = await this.getStateEmporiaVue();
    //if (!Number.isFinite(currentWatts)) {
    // throw new Error(`Invalid wattage received: ${currentWatts}`);
    //}
    this.state.isOn = currentWatts > powerThreshold;
    this.state.powerHistory.push(currentWatts);
    if (this.state.powerHistory.length > printInterval) {
      this.state.powerHistory.shift();
    }
    if (init) {
      this.platform.log.info(`Emporia Vue initialized to ${currentWatts} W.`);
    } else {
      this.state.printCount++;
      if (this.state.printCount >= printInterval) {
        const powerPrint = this.state.powerHistory.map(v => String(v).padStart(4, ' ')).join(', ');
        this.platform.log.info(`Current power consumption: ${powerPrint} W`);
        this.state.printCount = 0;
      } else {
        this.platform.log.debug(`Current power consumption: ${currentWatts} W`);
      }
    }
    this.state.watts = currentWatts;
    this.service.getCharacteristic(this.platform.Characteristic.CurrentAmbientLightLevel).updateValue(Math.max(0.0001, currentWatts));
    this.service.getCharacteristic(this.platform.Characteristic.On).updateValue(this.state.isOn);
  }

  // Retrieves state as per Emporia Vue API (doesn't update the device's internal state)
  async getStateEmporiaVue(): Promise<number> {
    return this.emporia.getState();
  }
}
