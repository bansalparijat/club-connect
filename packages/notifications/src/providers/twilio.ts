import type { WhatsAppProvider } from '../provider'

export class TwilioWhatsAppProvider implements WhatsAppProvider {
  private readonly accountSid: string
  private readonly authToken: string
  private readonly from: string

  constructor(accountSid: string, authToken: string, from: string) {
    this.accountSid = accountSid
    this.authToken = authToken
    this.from = from
  }

  async sendTemplate(
    phone: string,
    templateName: string,
    params: Record<string, string>
  ): Promise<{ messageId: string }> {
    // Twilio uses content templates via Content API
    // For simplicity, we build the message body by interpolating params
    const paramKeys = Object.keys(params).sort((a, b) => Number(a) - Number(b))
    let body = `[${templateName}]`
    paramKeys.forEach((key) => {
      body += ` ${params[key]}`
    })

    const credentials = Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64')

    const formData = new URLSearchParams({
      From: `whatsapp:${this.from}`,
      To: `whatsapp:${phone}`,
      Body: body,
    })

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      }
    )

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Twilio WhatsApp API error: ${response.status} ${error}`)
    }

    const data = (await response.json()) as { sid: string }
    return { messageId: data.sid }
  }
}
