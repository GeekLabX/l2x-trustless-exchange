// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

import fs from 'fs'
import winston from 'winston'
import { DiscordWebHook } from './logging/DiscordWebHookTransport'

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL

if (process.env.NODE_ENV !== 'docker') {
  // Winston 2.x requires the log directtory to exist
  try {
    fs.mkdirSync('logs')
  } catch (err) {
    /* assume directory already exists */
  }
}

const { transports } = winston

export const loggers = new winston.Container({
  transports: [
    // Setup your shared transports here
  ],
  exitOnError: false
})

/**
 * Logger for backend processes
 */

if (process.env.NODE_ENV === 'perf') {
  loggers.add('backend', {
    transports: [
      new transports.File({
        filename: 'logs/perf.log',
        level: 'error'
      })
    ]
  })
  loggers.add('frontend', {
    transports: [
      new transports.File({
        filename: 'logs/perf.log',
        level: 'info'
      })
    ]
  })
} else if (process.env.NODE_ENV === 'test') {
  loggers.add('backend', {
    transports: [
      new transports.File({
        filename: 'logs/backend-test.log',
        level: 'debug'
      })
    ]
  })
  loggers.add('frontend', {
    transports: [
      new transports.File({
        filename: 'logs/client-test.log',
        level: 'debug'
      })
    ]
  })
} else if (process.env.NODE_ENV === 'docker') {
  loggers.add('backend', {
    transports: [
      new transports.Console({
        colorize: true,
        prettyPrint: true,
        timestamp: true,
        level: 'info'
      })
    ]
  })
  loggers.add('frontend', {
    transports: [
      new transports.Console({
        colorize: true,
        prettyPrint: true,
        timestamp: true,
        level: 'info'
      })
    ]
  })
} else {
  // production / default loggers

  const backendTransports: winston.TransportInstance[] = [
    new transports.Console({
      colorize: true,
      prettyPrint: true,
      timestamp: true,
      level: 'info'
    }),
    new transports.File({
      filename: 'logs/backend-prod.log',
      level: 'info'
    })
  ]

  if (DISCORD_WEBHOOK_URL) {
    backendTransports.push(
      new DiscordWebHook({
        url: DISCORD_WEBHOOK_URL,
        level: 'error'
      })
    )
  }

  loggers.add('backend', {
    transports: backendTransports
  })

  loggers.add('frontend', {
    transports: [
      new transports.Console({
        colorize: true,
        prettyPrint: true,
        timestamp: true,
        level: 'warn'
      }),

      new transports.File({
        filename: 'logs/client-prod.log',
        level: 'debug'
      })
    ]
  })
}
