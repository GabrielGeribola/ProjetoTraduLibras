import { Inter } from 'next/font/google';
import './style/globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'TraduLibras',
  description: 'Plataforma de tradução de texto para Libras',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-br">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
