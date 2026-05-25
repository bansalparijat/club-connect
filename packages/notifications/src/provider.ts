export interface WhatsAppProvider {
  sendTemplate(
    phone: string,
    templateName: string,
    params: Record<string, string>
  ): Promise<{ messageId: string }>
}
