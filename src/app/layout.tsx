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
            __html: `(function(){function h2h(h){h=h.replace('#','');if(!/^[0-9a-fA-F]{6}$/.test(h))return[217,.83,.53];var n=parseInt(h,16),r=(n>>16&255)/255,g=(n>>8&255)/255,b=(n&255)/255,mx=Math.max(r,g,b),mn=Math.min(r,g,b),l=(mx+mn)/2,s=0,hd=0;if(mx!==mn){var dd=mx-mn;s=l>.5?dd/(2-mx-mn):dd/(mx+mn);if(mx===r)hd=((g-b)/dd+(g<b?6:0))/6;else if(mx===g)hd=((b-r)/dd+2)/6;else hd=((r-g)/dd+4)/6}return[hd*360,s,l]}function h2x(h,s,l){h=((h%360)+360)%360;var c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs((h/60)%2-1)),m=l-c/2,r=0,g=0,b=0;if(h<60)[r,g,b]=[c,x,0];else if(h<120)[r,g,b]=[x,c,0];else if(h<180)[r,g,b]=[0,c,x];else if(h<240)[r,g,b]=[0,x,c];else if(h<300)[r,g,b]=[x,0,c];else[r,g,b]=[c,0,x];var t=function(v){return Math.round((v+m)*255).toString(16).padStart(2,'0')};return'#'+t(r)+t(g)+t(b)}try{var t=localStorage.getItem('theme')||'system';var a=localStorage.getItem('accent')||'blue';var e=localStorage.getItem('effect')||'none';var d=document.documentElement;if(t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme:dark)').matches)){d.classList.remove('light');d.classList.add('dark')}else{d.classList.remove('dark');d.classList.add('light')}var dark=d.classList.contains('dark');var hex=null;if(a==='custom'){var ca=localStorage.getItem('customAccent');if(ca&&/^#[0-9a-fA-F]{6}$/.test(ca)){hex=ca}}if(!hex){var C={blue:{l:'#2563eb',d:'#60a5fa'},purple:{l:'#9333ea',d:'#c084fc'},teal:{l:'#0d9488',d:'#2dd4bf'},green:{l:'#16a34a',d:'#4ade80'},orange:{l:'#ea580c',d:'#fb923c'},red:{l:'#dc2626',d:'#f87171'},pink:{l:'#db2777',d:'#f472b6'},indigo:{l:'#4f46e5',d:'#818cf8'}};hex=(C[a]||C.blue)[dark?'d':'l']}var H=h2h(hex);H[1]=Math.min(H[1],.85);var base,hover;if(dark){var L=Math.max(H[2],.66);base=h2x(H[0],Math.min(H[1],.75),L);hover=h2x(H[0],Math.min(H[1],.75),Math.min(1,L+.09))}else{var L2=Math.min(H[2],.42);base=h2x(H[0],H[1],L2);hover=h2x(H[0],H[1],Math.max(0,L2-.07))}var nn=parseInt(base.slice(1),16);d.style.setProperty('--accent',base);d.style.setProperty('--accent-hover',hover);d.style.setProperty('--accent-light','rgba('+(nn>>16&255)+','+(nn>>8&255)+','+(nn&255)+','+(dark?.14:.1)+')');d.style.setProperty('--accent-muted','rgba('+(nn>>16&255)+','+(nn>>8&255)+','+(nn&255)+',.09)');d.setAttribute('data-effect',e);d.setAttribute('data-density',localStorage.getItem('density')||'comfortable');if(localStorage.getItem('highContrast')==='true')d.setAttribute('data-contrast','high');if(localStorage.getItem('reducedMotion')==='true')d.setAttribute('data-motion','reduced');var fs={sm:'14px',md:'',lg:'17.5px'}[localStorage.getItem('fontScale')||'md'];if(fs)d.style.fontSize=fs}catch(x){}})();`,
          }}
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
