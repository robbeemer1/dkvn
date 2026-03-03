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

interface EmailChangeEmailProps {
  siteName: string
  email: string
  newEmail: string
  confirmationUrl: string
}

export const EmailChangeEmail = ({
  siteName,
  email,
  newEmail,
  confirmationUrl,
}: EmailChangeEmailProps) => (
  <Html lang="nl" dir="ltr">
    <Head />
    <Preview>Bevestig je nieuwe e-mailadres voor De Kunst van Netwerken</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src="https://buoysrflkhemyterpamd.supabase.co/storage/v1/object/public/email-assets/logo_dkvn.png" alt="De Kunst van Netwerken" width="180" style={logo} />
        <Heading style={h1}>E-mailadres wijzigen</Heading>
        <Text style={text}>
          Je hebt een verzoek ingediend om je e-mailadres te wijzigen van{' '}
          <Link href={`mailto:${email}`} style={link}>{email}</Link>{' '}
          naar{' '}
          <Link href={`mailto:${newEmail}`} style={link}>{newEmail}</Link>.
        </Text>
        <Text style={text}>
          Klik op onderstaande knop om deze wijziging te bevestigen:
        </Text>
        <Button style={button} href={confirmationUrl}>
          E-mailadres bevestigen
        </Button>
        <Text style={footer}>
          Heb je dit niet aangevraagd? Beveilig dan direct je account.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default EmailChangeEmail

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
const link = { color: 'hsl(25, 90%, 52%)', textDecoration: 'underline' }
const button = {
  backgroundColor: 'hsl(25, 90%, 52%)',
  color: '#ffffff',
  fontSize: '14px',
  fontWeight: 'bold' as const,
  borderRadius: '0.625rem',
  padding: '12px 24px',
  textDecoration: 'none',
}
const footer = { fontSize: '12px', color: '#999999', margin: '32px 0 0' }
