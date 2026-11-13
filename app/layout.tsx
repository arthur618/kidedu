import type { ReactNode } from "react";

export const metadata = {
  title: "语文伴学",
  description: "帮三四年级的孩子自己完成语文作业。",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
