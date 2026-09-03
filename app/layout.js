import './globals.css';

export const metadata = {
  title: 'Weekly TD Parlay',
  description: 'Submit one anytime-TD scorer from your fantasy roster each week.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}
