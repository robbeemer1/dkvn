/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="nl" dir="ltr">
    <Head />
    <Preview>Je verificatiecode voor De Kunst van Netwerken</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src="https://buoysrflkhemyterpamd.supabase.co/storage/v1/object/public/email-assets/logo_dkvn.png" alt="De Kunst van Netwerken" width="180" style={logo} />
        <Heading style={h1}>Verificatiecode</Heading>
        <Text style={text}>Gebruik onderstaande code om je identiteit te bevestigen:</Text>
        <Text style={codeStyle}>{token}</Text>
        <Text style={footer}>
          Deze code verloopt binnenkort. Heb je dit niet aangevraagd? Dan kun je deze e-mail veilig negeren.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail

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
const codeStyle = {
  fontFamily: 'Courier, monospace',
  fontSize: '28px',
  fontWeight: 'bold' as const,
  color: 'hsl(25, 90%, 52%)',
  margin: '0 0 30px',
  letterSpacing: '4px',
}
const footer = { fontSize: '12px', color: '#999999', margin: '32px 0 0' }
