#!/usr/bin/env node
"use strict"

const osmosis = require("osmosis")
const chalk = require("chalk")
const rainbow = require("chalk-rainbow")
const twilio = require("twilio")
const format = require("date-format")
const pretty = require("pretty-ms")
const airports = require("airports")

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
 * Fetch latest Southwest prices
 *
 * @return {Void}
 */
const fetch = () => {
  osmosis
    .get("https://www.southwest.com")
    .submit(".booking-form--form", {
      twoWayTrip: true,
      airTranRedirect: "",
      returnAirport: "RoundTrip",
      outboundTimeOfDay: "ANYTIME",
      returnTimeOfDay: "ANYTIME",
      seniorPassengerCount: 0,
      fareType: "DOLLARS",
      originAirport,
      destinationAirport,
      outboundDateString,
      returnDateString,
      adultPassengerCount
    })
    .find("#faresOutbound .product_price")
    .then((priceMarkup) => {
      const matches = priceMarkup.toString().match(/\$.*?(\d+)/)
      const price = parseInt(matches[1])
      fares.outbound.push(price)
    })
    .find("#faresReturn .product_price")
    .then((priceMarkup) => {
      const matches = priceMarkup.toString().match(/\$.*?(\d+)/)
      const price = parseInt(matches[1])
      fares.return.push(price)
    })
    .done(() => {
      const lowestOutboundFare = Math.min(...fares.outbound)
      const lowestReturnFare = Math.min(...fares.return)
      var faresAreValid = true

      // Clear previous fares
      fares.outbound = []
      fares.return = []

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

        console.log([
          `Lowest fares for an outbound flight is currently \$${[lowestOutboundFare, outboundFareDiffString].filter(i => i).join(" ")}`,
          `Lowest fares for a return flight is currently \$${[lowestReturnFare, returnFareDiffString].filter(i => i).join(" ")}`
        ])
      }

      setTimeout(fetch, interval * TIME_MIN)
    })
}

fetch()
