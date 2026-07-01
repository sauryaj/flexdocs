import type { Metadata } from 'next';
import './globals.css';
import Providers from '@/components/Providers';

export const metadata: Metadata = {
  title: 'FlexDocs - IT Documentation & Management',
  description: 'ITGlue alternative for document management, password vault, and domain tracking',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme')||'system';var a=localStorage.getItem('accent')||'blue';var e=localStorage.getItem('effect')||'none';var d=document.documentElement;if(t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme:dark)').matches)){d.classList.remove('light');d.classList.add('dark')}else{d.classList.remove('dark');d.classList.add('light')}var C={blue:{l:'#2563eb',d:'#60a5fa'},purple:{l:'#9333ea',d:'#c084fc'},teal:{l:'#0d9488',d:'#2dd4bf'},green:{l:'#16a34a',d:'#4ade80'},orange:{l:'#ea580c',d:'#fb923c'},red:{l:'#dc2626',d:'#f87171'},pink:{l:'#db2777',d:'#f472b6'},indigo:{l:'#4f46e5',d:'#818cf8'}};var c=C[a]||C.blue;var m=d.classList.contains('dark')?'d':'l';d.style.setProperty('--accent',c[m]);d.setAttribute('data-effect',e)}catch(x){}})();`,
          }}
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
