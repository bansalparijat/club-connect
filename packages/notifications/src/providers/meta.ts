import type { WhatsAppProvider } from '../provider'

export class MetaCloudProvider implements WhatsAppProvider {
  private readonly token: string
  private readonly phoneNumberId: string

  constructor(token: string, phoneNumberId: string) {
    this.token = token
    this.phoneNumberId = phoneNumberId
  }

  async sendTemplate(
    phone: string,
    templateName: string,
    params: Record<string, string>
  ): Promise<{ messageId: string }> {
    const components = []

    const paramKeys = Object.keys(params).sort((a, b) => Number(a) - Number(b))
    if (paramKeys.length > 0) {
      components.push({
        type: 'body',
        parameters: paramKeys.map((key) => ({
          type: 'text',
          text: params[key],
        })),
      })
    }

    const response = await fetch(
      `https://graph.facebook.com/v19.0/${this.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: phone.replace('+', ''),
          type: 'template',
          template: {
            name: templateName,
            language: { code: 'en' },
            components,
          },
        }),
      }
    )

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Meta WhatsApp API error: ${response.status} ${error}`)
    }

    const data = (await response.json()) as { messages?: Array<{ id: string }> }
    const messageId = data.messages?.[0]?.id ?? 'unknown'
    return { messageId }
  }
}
