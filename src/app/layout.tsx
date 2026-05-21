import type { Metadata } from 'next'
import { Provider } from '@/components/ui/provider'

export const metadata: Metadata = {
  title: 'HHG Engine',
  description: '商品資料轉換引擎',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-TW">
      <body>
        <Provider>{children}</Provider>
      </body>
    </html>
  )
}
