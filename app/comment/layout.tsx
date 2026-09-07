import React from "react";

export default function CommentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="comment-overlay-wrapper">
      <style dangerouslySetInnerHTML={{ __html: `
        body { 
          background: transparent !important; 
        }
        html {
          background: transparent !important;
        }
        main {
          background: transparent !important;
        }
      ` }} />
      {children}
    </div>
  );
}
