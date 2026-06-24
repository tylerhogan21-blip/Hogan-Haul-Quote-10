import './globals.css';

export const metadata = {
  title: 'Hogan Haul Quote',
  description: 'Dump truck haul rate calculator for Hogan Haul Quote',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
