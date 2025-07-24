import process from 'node:process'
import { consola } from 'consola'
import { isDevelopment, isProduction } from 'std-env'

interface SlackMessage {
  text: string
  username?: string
  icon_emoji?: string
  attachments?: Array<{
    color?: string
    fields?: Array<{
      title: string
      value: string
      short?: boolean
    }>
    text?: string
    title?: string
    title_link?: string
    footer?: string
    ts?: number
  }>
}

interface SlackNotificationOptions {
  message: string
  title?: string
  color?: 'good' | 'warning' | 'danger'
  fields?: Array<{
    title: string
    value: string
    short?: boolean
  }>
  tagMaxi?: boolean
  context?: Record<string, any>
}

export async function sendSlackNotification(options: SlackNotificationOptions): Promise<void> {
  // Only send notifications in production unless explicitly testing
  if (!isProduction && !process.env.NUXT_SLACK_WEBHOOK_URL_FORCE_DEV) {
    consola.info('Skipping Slack notification in development:', options.message)
    return
  }

  const { slackWebhookUrl } = useRuntimeConfig()

  if (!slackWebhookUrl) {
    consola.warn('NUXT_SLACK_WEBHOOK_URL not configured, skipping Slack notification')
    return
  }

  const { nimiqNetwork, gitBranch } = useRuntimeConfig().public

  // Prepare the message
  let messageText = options.message
  if (options.tagMaxi && isProduction) {
    messageText = `<@maxi> ${messageText}`
  }

  const slackMessage: SlackMessage = {
    text: messageText,
    username: 'Nimiq Validators API',
    icon_emoji: ':nimiq:',
    attachments: [
      {
        color: options.color || 'good',
        title: options.title,
        fields: [
          {
            title: 'Network',
            value: nimiqNetwork,
            short: true,
          },
          {
            title: 'Branch',
            value: gitBranch,
            short: true,
          },
          {
            title: 'Environment',
            value: isDevelopment ? 'Development' : 'Production',
            short: true,
          },
          {
            title: 'Timestamp',
            value: new Date().toISOString(),
            short: true,
          },
          ...(options.fields || []),
        ],
        footer: 'Nimiq Validators API',
        ts: Math.floor(Date.now() / 1000),
      },
    ],
  }

  // Add context if provided
  if (options.context && slackMessage.attachments?.[0]?.fields) {
    slackMessage.attachments[0].fields.push({
      title: 'Context',
      value: `\`\`\`${JSON.stringify(options.context, null, 2)}\`\`\``,
      short: false,
    })
  }

  try {
    await $fetch(slackWebhookUrl, {
      method: 'POST',
      body: slackMessage,
      headers: {
        'Content-Type': 'application/json',
      },
    })

    consola.success('Slack notification sent successfully')
  }
  catch (error) {
    consola.error('Failed to send Slack notification:', error)
  }
}

// Specific notification functions for different scenarios
export async function sendSyncFailureNotification(
  syncType: 'missing-epoch' | 'snapshot',
  error: any,
  endpoint?: string,
): Promise<void> {
  const { nimiqNetwork } = useRuntimeConfig().public

  await sendSlackNotification({
    message: `🚨 Sync failure detected on ${nimiqNetwork}`,
    title: `${syncType} sync failed`,
    color: 'danger',
    tagMaxi: true,
    fields: [
      {
        title: 'Sync Type',
        value: syncType,
        short: true,
      },
      ...(endpoint
        ? [{
            title: 'Endpoint',
            value: endpoint,
            short: true,
          }]
        : []),
    ],
    context: {
      error: error?.message || error,
      stack: error?.stack,
      timestamp: new Date().toISOString(),
    },
  })
}

export async function sendNewEpochNotification(
  epochNumber: number,
  totalSynced: number,
): Promise<void> {
  const { nimiqNetwork } = useRuntimeConfig().public

  // Only send for mainnet
  if (nimiqNetwork !== 'main-albatross') {
    return
  }

  await sendSlackNotification({
    message: `📊 New epoch synced on mainnet`,
    title: `Epoch ${epochNumber} synchronized`,
    color: 'good',
    tagMaxi: false, // Don't tag Maxi for new epoch notifications
    fields: [
      {
        title: 'Epoch Number',
        value: epochNumber.toString(),
        short: true,
      },
      {
        title: 'Total Synced',
        value: totalSynced.toString(),
        short: true,
      },
    ],
  })
}
