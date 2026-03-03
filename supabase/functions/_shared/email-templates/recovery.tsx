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
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
}

export const RecoveryEmail = ({
  siteName,
  confirmationUrl,
}: RecoveryEmailProps) => (
  <Html lang="nl" dir="ltr">
    <Head />
    <Preview>Wachtwoord herstellen voor De Kunst van Netwerken</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src="https://buoysrflkhemyterpamd.supabase.co/storage/v1/object/public/email-assets/logo_dkvn.png" alt="De Kunst van Netwerken" width="180" style={logo} />
        <Heading style={h1}>Wachtwoord herstellen</Heading>
        <Text style={text}>
          Je hebt een verzoek ingediend om je wachtwoord te herstellen. Klik op onderstaande knop om een nieuw wachtwoord in te stellen.
        </Text>
        <Button style={button} href={confirmationUrl}>
          Wachtwoord herstellen
        </Button>
        <Text style={footer}>
          Heb je dit niet aangevraagd? Dan kun je deze e-mail veilig negeren. Je wachtwoord blijft ongewijzigd.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default RecoveryEmail

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
