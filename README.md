# Ryanair Alerts
Dashboard to monitor and receive alerts for changes in Ryanair fare prices.

## Why?
I came across the following [article](https://hackernoon.com/the-programmers-guide-to-booking-a-plane-11e37d610045) and decided to try to make it work for Ryanair. Currently this does not offer any advantages over Google Flight alerts but I will hopefully get around to adding additional functionality such as sending an alert whenever any flight from a list of pre selected routes within a specified date range goes on sale.

## Installation
Clone the repo and use `npm link` to use the executable.
```
cd wherever-you-cloned-it-to
npm link
```

If you recieve a ``SyntaxError: Unexpected token ...`` upon running the `ryanair` command, make sure you are running a version of node that supports ES6 syntax (5.11.0 and up). 

Under some circumstances, libxmljs may throw an error that looks like this:
```
Error: Could not locate the bindings file. Tried:
 → /root/swa-dashboard/node_modules/libxmljs/build/xmljs.node
 ```
You can fix it and run `ryanair` successfully by rebuilding libxmljs manually:
```
sudo npm install -g node-gyp
cd node_modules/libxmljs
node-gyp rebuild
```

## Usage
It will scrape Ryanair's prices every `n` minutes (`n` = whatever interval you
define via the `--interval` flag) and compare the results, letting you know the
difference in price since the last interval. The default interval is 30 mins.

You may optionally set the `--individual-deal-price` flag, which will alert you
if either fare price falls below the threshold you define. There is also the
optional `--total-deal-price` flag, which will alert you if the combined total
of both fares falls below the threshold. Other than `--interval` and the
Twilio-related options, all other flags are required.

```bash
ryanair \
  --from 'DUB' \
  --to 'PSA' \
  --leave-date '30/05/2017' \
  --return-date '07/06/2017' \
  --passengers 2 \
  --individual-deal-price 50 \ # In euro (optional)
  --total-deal-price 120 \ # In euro (optional)
  --interval 5 # In minutes (optional)
```

### Twilio integration
If you have a Twilio account (I'm using a free trial account) and you've set up
a deal price threshold, you can set the following environment vars to set up SMS
deal alerts. _Just be warned: as long as the deal threshold is met, you're going
to receive SMS messages at the rate of the interval you defined. Better wake up
and book those tickets!_

```bash
export TWILIO_ACCOUNT_SID=""
export TWILIO_AUTH_TOKEN=""
export TWILIO_PHONE_FROM=""
export TWILIO_PHONE_TO=""
```
