#!/usr/bin/env node
"use strict"

const chalk = require("chalk")
const rainbow = require("chalk-rainbow")
const twilio = require("twilio")
const airports = require("airports")
const request = require("request")
const JSONStream = require('JSONStream')
const es = require('event-stream');

// Time constants
const TIME_MS = 1
const TIME_SEC = TIME_MS * 1000
const TIME_MIN = TIME_SEC * 60
const TIME_HOUR = TIME_MIN * 60

// Fares
var prevLowestOutboundFare
var prevLowestReturnFare
const fares = {
  outbound: [],
  return: []
}

// Command line options
var originAirport
var destinationAirport
var outboundDateString
var returnDateString
var adultPassengerCount
var individualDealPrice
var totalDealPrice
var interval = 30 // In minutes

// Parse command line options (no validation, sorry!)
process.argv.forEach((arg, i, argv) => {
  switch (arg) {
    case "--from":
      originAirport = argv[i + 1]
      break
    case "--to":
      destinationAirport = argv[i + 1]
      break
    case "--leave-date":
      outboundDateString = argv[i + 1]
      break
    case "--return-date":
      returnDateString = argv[i + 1]
      break
    case "--passengers":
      adultPassengerCount = argv[i + 1]
      break
    case "--individual-deal-price":
      individualDealPrice = parseInt(argv[i + 1])
      break
    case "--total-deal-price":
      totalDealPrice = parseInt(argv[i + 1])
      break
    case "--interval":
      interval = parseFloat(argv[i + 1])
      break
  }
})

// Check if Twilio env vars are set
const isTwilioConfigured = process.env.TWILIO_ACCOUNT_SID &&
                           process.env.TWILIO_AUTH_TOKEN &&
                           process.env.TWILIO_PHONE_FROM &&
                           process.env.TWILIO_PHONE_TO

/**
 * Send a text message using Twilio
 *
 * @param {Str} message
 *
 * @return {Void}
 */
const sendTextMessage = (message) => {
  try {
    const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)

    twilioClient.sendMessage({
      from: process.env.TWILIO_PHONE_FROM,
      to: process.env.TWILIO_PHONE_TO,
      body: message
    }, function(err, data) {
      if (err) {
        console.log([
          chalk.red(`Error: failed to send SMS to ${process.env.TWILIO_PHONE_TO} from ${process.env.TWILIO_PHONE_FROM}`)
        ])
      } else {
        console.log([
          chalk.green(`Successfully sent SMS to ${process.env.TWILIO_PHONE_TO} from ${process.env.TWILIO_PHONE_FROM}`)
        ])
      }
    })
  } catch(e) {}
}

/**
 * Fetch latest Ryanair prices
 *
 * @return {Void}
 */
const fetch = () => {
  let roundTrip = returnDateString ? true : false
  let reqURL = 'https://desktopapps.ryanair.com/en-ie/availability?ADT=' + adultPassengerCount + '&CHD=0&DateIn=' + returnDateString + '&DateOut=' + outboundDateString + '&Destination=' + destinationAirport + '&FlexDaysIn=0&FlexDaysOut=0&INF=0&Origin=' + originAirport + '&RoundTrip=' + roundTrip + '&TEEN=0&exists=false'
  request({url: reqURL})
    .pipe(JSONStream.parse())
    .pipe(es.mapSync((data) => {

      // TODO get lowest from list of fares
      const lowestOutboundFare = data.trips[0].dates[0].flights[0].regularFare.fares[0].amount
      const lowestReturnFare = data.trips[1].dates[0].flights[0].regularFare.fares[0].amount
      var faresAreValid = true

      // Get difference from previous fares
      const outboundFareDiff = prevLowestOutboundFare - lowestOutboundFare
      const returnFareDiff = prevLowestReturnFare - lowestReturnFare
      var outboundFareDiffString = ""
      var returnFareDiffString = ""

      if (faresAreValid) {

        // Store current fares for next time
        prevLowestOutboundFare = lowestOutboundFare
        prevLowestReturnFare = lowestReturnFare
        // Create a string to show the difference
        if (!isNaN(outboundFareDiff) && !isNaN(returnFareDiff)) {

          // Usually this is because of a scraping error
          if (!isFinite(outboundFareDiff) || !isFinite(returnFareDiff)) {
            faresAreValid = false
          }

          if (outboundFareDiff > 0) {
            outboundFareDiffString = chalk.green(`(down \$${Math.abs(outboundFareDiff)})`)
          } else if (outboundFareDiff < 0) {
            outboundFareDiffString = chalk.red(`(up \$${Math.abs(outboundFareDiff)})`)
          } else if (outboundFareDiff === 0) {
            outboundFareDiffString = chalk.blue(`(no change)`)
          }

          if (returnFareDiff > 0) {
            returnFareDiffString = chalk.green(`(down \$${Math.abs(returnFareDiff)})`)
          } else if (returnFareDiff < 0) {
            returnFareDiffString = chalk.red(`(up \$${Math.abs(returnFareDiff)})`)
          } else if (returnFareDiff === 0) {
            returnFareDiffString = chalk.blue(`(no change)`)
          }

        // Do some Twilio magic (SMS alerts for awesome deals)
        const awesomeDealIsAwesome = (
          totalDealPrice && (lowestOutboundFare + lowestReturnFare <= totalDealPrice)
        ) || (
          individualDealPrice && (lowestOutboundFare <= individualDealPrice || lowestReturnFare <= individualDealPrice)
        )

        if (awesomeDealIsAwesome) {
          const message = `Deal alert! Combined total has hit \$${lowestOutboundFare + lowestReturnFare}. Individual fares are \$${lowestOutboundFare} (outbound) and \$${lowestReturnFare} (return).`
          console.log(message);

          if (isTwilioConfigured) {
            sendTextMessage(message)
          }
        }

        [
          `Lowest fares for an outbound flight is currently €${[lowestOutboundFare, outboundFareDiffString].filter(i => i).join(" ")}`,
          `Lowest fares for a return flight is currently €${[lowestReturnFare, returnFareDiffString].filter(i => i).join(" ")}`
        ].forEach((price) => {
          console.log(price)
        })
        console.log()
      }

      setTimeout(fetch, interval * TIME_MIN)
    }
  }))
}

fetch()
