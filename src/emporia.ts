import { EmporiaVue } from 'emporia-vue-lib';

export interface CoreLogging {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  info: (message: string, ...parameters: any) => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  warn: (message: string, ...parameters: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error: (message: string, ...parameters: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  debug: (message: string, ...parameters: any) => void;
}

export class EmporiaVueIntegration {
  private channelName: string;
  private refreshIntervalMinutes: number;
  private username: string;
  private password: string;
  private log: CoreLogging;

  constructor(channelName: string, refreshIntervalMinutes: number, username: string, password: string, log: CoreLogging) {
    this.channelName = channelName;
    this.refreshIntervalMinutes = refreshIntervalMinutes;
    this.username = username;
    this.password = password;
    this.log = log;
  }

  getCronSchedules(): string[] {
    return [ `*/${this.refreshIntervalMinutes} * * * *` ]; // runs status update every X minutes
  }

  // Return current state (boolean) from Emporia API based on channel's current watts usage
  async getState(): Promise<number> {
    // Login with username/password (tokens will be stored for reuse on subsequent logins)
    const vue = new EmporiaVue();
    try {
      await vue.login({
        username: this.username,
        password: this.password,
        tokenStorageFile: 'keys.json',
      });
    } catch (error) {
      this.log.error('Error logging to Emporia Vue API', error);
      return 0;
    }

    // Get all devices
    let devices;
    try {
      devices = await vue.getDevices();
    } catch (error) {
      this.log.error('Error fetching devices from Emporia Vue API', error);
      return 0;
    }

    // Find the device that hosts the channel we are concerned with
    const channel = devices
      .flatMap(device => device.channels)
      .find(channel => channel.channelNum === this.channelName);
    if (!channel) {
      this.log.error(`Channel with name '${this.channelName}' not found, assuming OFF state`);
      return 0;
    }

    // Get current energy usage for device/channel
    let deviceChannelUsage;
    try {
      const allUsageData = await vue.getDeviceListUsage(String(channel.deviceGid));
      deviceChannelUsage = allUsageData[channel.deviceGid].channelUsages[channel.channelNum];
    } catch (error) {
      this.log.error(`Error fetching '${this.channelName}' current kWh usage from Emporia Vue API`, error);
      return 0;
    }

    // Convert kWh to Watts and round to 2 decimal places
    return parseFloat((deviceChannelUsage.usage * 3600000).toFixed(0));
  }
}
