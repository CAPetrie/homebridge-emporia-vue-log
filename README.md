# homebridge-emporia-vue-log

Emporia Vue virtual switch plug-in (integration) that relies on Emporia Vue API to determine wether a device/channel is consuming a certain number of watts, and based on a watts threashold value, turns ON or OFF a HomeKit virtual switch.

Switch states:

- **ON** -> The given device/channel is currently consuming at least X (threashold) watts
- **OFF** -> The given device/channel is currently NOT consuming at least X (treashold) watts

With this virtual switch, you can then use HomeKit automations to turn other devices ON/OFF when this virtual switch changes state (ON/OFF), to gain even more flexibility in your home automations.
