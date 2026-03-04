/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const InviteEmail = ({
  siteName,
  siteUrl,
  confirmationUrl,
}: InviteEmailProps) => (
  <Html lang="nl" dir="ltr">
    <Head />
    <Preview>Je bent uitgenodigd voor De Kunst van Netwerken</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src="https://buoysrflkhemyterpamd.supabase.co/storage/v1/object/public/email-assets/logo_dkvn.png" alt="De Kunst van Netwerken" width="180" style={logo} />
        <Heading style={h1}>Je bent uitgenodigd!</Heading>
        <Text style={text}>
          Je bent uitgenodigd om lid te worden van{' '}
          <Link href={siteUrl} style={link}>
            <strong>De Kunst van Netwerken</strong>
          </Link>
          . Klik op onderstaande knop om je uitnodiging te accepteren en je account aan te maken.
        </Text>
        <Button style={button} href={confirmationUrl}>
          Uitnodiging accepteren
        </Button>
        <Text style={footer}>
          Verwachtte je deze uitnodiging niet? Dan kun je deze e-mail veilig negeren.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default InviteEmail

const main = { backgroundColor: '#ffffff', fontFamily: 'ui-sans-serif, system-ui, sans-serif' }
const container = { padding: '32px 28px' }
const logo = { margin: '0 0 24px' }
const h1 = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: 'hsl(225, 30%, 16%)',
  margin: '0 0 20px',
}
const text = {
  fontSize: '14px',
  color: 'hsl(225, 10%, 46%)',
  lineHeight: '1.6',
  margin: '0 0 24px',
}
const link = { color: '#e86c1a', textDecoration: 'underline' }
const button = {
  backgroundColor: '#e86c1a',
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: 'bold' as const,
  borderRadius: '8px',
  padding: '14px 32px',
  textDecoration: 'none',
  display: 'inline-block' as const,
  textAlign: 'center' as const,
  border: '2px solid #e86c1a',
}
const footer = { fontSize: '12px', color: '#999999', margin: '32px 0 0' }
