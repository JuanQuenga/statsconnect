import assert from "node:assert/strict";
import test from "node:test";
import { localHostname, selectLanIpv4 } from "./mobile-dev.ts";

test("selectLanIpv4 prefers en0", () => {
  assert.equal(selectLanIpv4({
    en0: [{ address: "192.168.50.151", cidr: "192.168.50.151/24", family: "IPv4", internal: false, mac: "00:00:00:00:00:00", netmask: "255.255.255.0", scopeid: 0 }],
    en7: [{ address: "10.0.0.4", cidr: "10.0.0.4/24", family: "IPv4", internal: false, mac: "00:00:00:00:00:01", netmask: "255.255.255.0", scopeid: 0 }],
  }), "192.168.50.151");
});

test("selectLanIpv4 rejects loopback-only interfaces", () => {
  assert.throws(() => selectLanIpv4({
    lo0: [{ address: "127.0.0.1", cidr: "127.0.0.1/8", family: "IPv4", internal: true, mac: "00:00:00:00:00:00", netmask: "255.0.0.0", scopeid: 0 }],
  }), /No non-loopback IPv4 address/);
});

test("localHostname normalizes the Bonjour host", () => {
  assert.equal(localHostname("Juans-MacBook-Air.local\n"), "juans-macbook-air.local");
});
