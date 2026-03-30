import React, { useMemo, useState } from 'react';
import clsx from 'clsx';
import { ArrowLeft, Menu, Download, X, Printer } from 'lucide-react';

interface DocumentViewerProps {
  content: string;
  title: string;
  onBack: () => void;
  canDownload?: boolean;
  canPrint?: boolean;
  onDownload?: () => void;
  onPrint?: () => void;
}

interface TOCItem {
  id: string;
  text: string | null;
  level: number;
}

const DocumentViewer: React.FC<DocumentViewerProps> = ({ 
  content, 
  title, 
  onBack,
  canDownload = false,
  canPrint = false,
  onDownload,
  onPrint
}) => {
  const [showMobileToc, setShowMobileToc] = useState(false);
  const isPdf = content.startsWith('data:application/pdf');

  const { processedContent, toc, pdfUrl } = useMemo(() => {
    if (isPdf) {
      try {
        const base64Data = content.split(',')[1];
        const binaryString = window.atob(base64Data);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        return { 
          processedContent: content, 
          toc: [],
          pdfUrl: url
        };
      } catch (e) {
        console.error("Failed to convert PDF base64 to blob", e);
        return { processedContent: content, toc: [], pdfUrl: null };
      }
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(content, 'text/html');
    const headers = doc.querySelectorAll('h1, h2, h3');
    const tocItems: TOCItem[] = [];
    
    headers.forEach((h, i) => {
      const id = `doc-toc-${i}`;
      h.id = id;
      tocItems.push({ 
        id, 
        text: h.textContent, 
        level: parseInt(h.tagName.substring(1)) 
      });
    });

    return { 
      processedContent: doc.body.innerHTML, 
      toc: tocItems,
      pdfUrl: null
    };
  }, [content]);

  const scrollToHeading = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
      setShowMobileToc(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden relative">
      {/* Header */}
      <div className="flex items-center gap-3 p-3 md:p-4 border-b border-gray-200 bg-white z-10 shrink-0">
        <button 
          onClick={onBack}
          className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg md:text-xl font-semibold text-gray-900 line-clamp-1 flex-1">
          {title}
        </h1>
        
        {/* Action buttons - chỉ hiện khi có quyền */}
        <div className="flex items-center gap-2">
          {canPrint && onPrint && (
            <button 
              onClick={onPrint}
              className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"
              title="In tài liệu"
            >
              <Printer size={20} />
            </button>
          )}
          {canDownload && onDownload && (
            <button 
              onClick={onDownload}
              className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"
              title="Tải xuống"
            >
              <Download size={20} />
            </button>
          )}
          {!isPdf && toc.length > 0 && (
            <button 
              onClick={() => setShowMobileToc(true)}
              className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors md:hidden"
            >
              <Menu size={20} />
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden relative">
        {/* Sidebar TOC - Desktop */}
        {!isPdf && (
          <div className="hidden md:block w-64 border-r border-gray-200 bg-gray-50 overflow-y-auto p-4 flex-shrink-0">
            <div className="flex items-center gap-2 mb-4 text-gray-900 font-medium">
              <Menu size={18} />
              <span>Mục lục</span>
            </div>
            <nav className="space-y-1">
              {toc.length === 0 && (
                <p className="text-sm text-gray-500 italic pl-2">Không có mục lục</p>
              )}
              {toc.map((item) => (
                <button
                  key={item.id}
                  onClick={() => scrollToHeading(item.id)}
                  className={clsx(
                    "block w-full text-left text-sm py-1.5 pr-2 hover:text-primary transition-colors truncate",
                    item.level === 1 ? "pl-2 font-medium text-gray-800" :
                    item.level === 2 ? "pl-6 text-gray-600" :
                    "pl-10 text-gray-500"
                  )}
                  title={item.text || ''}
                >
                  {item.text}
                </button>
              ))}
            </nav>
          </div>
        )}

        {/* Mobile TOC Drawer */}
        {!isPdf && (
          <>
            {showMobileToc && (
              <div 
                className="fixed inset-0 bg-black/50 z-40 md:hidden"
                onClick={() => setShowMobileToc(false)}
              />
            )}
            
            <div className={clsx(
              "absolute top-0 right-0 bottom-0 w-64 bg-white shadow-xl z-50 transform transition-transform duration-300 ease-in-out md:hidden flex flex-col border-l border-gray-200",
              showMobileToc ? "translate-x-0" : "translate-x-full"
            )}>
              <div className="flex items-center justify-between p-4 border-b border-gray-100">
                <h3 className="font-semibold text-gray-900">Mục lục</h3>
                <button 
                  onClick={() => setShowMobileToc(false)}
                  className="p-1 hover:bg-gray-100 rounded text-gray-500"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                <nav className="space-y-1">
                  {toc.length === 0 && (
                    <p className="text-sm text-gray-500 italic">Không có mục lục</p>
                  )}
                  {toc.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => scrollToHeading(item.id)}
                      className={clsx(
                        "block w-full text-left text-sm py-2 pr-2 hover:text-primary transition-colors truncate border-b border-gray-50 last:border-0",
                        item.level === 1 ? "pl-0 font-medium text-gray-800" :
                        item.level === 2 ? "pl-4 text-gray-600" :
                        "pl-8 text-gray-500"
                      )}
                    >
                      {item.text}
                    </button>
                  ))}
                </nav>
              </div>
            </div>
          </>
        )}

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-white h-full relative">
          {isPdf ? (
            pdfUrl ? (
              <iframe
                src={pdfUrl + '#toolbar=0'}
                className="w-full h-full border-none"
                title="PDF Viewer"
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-red-500 gap-2">
                <p>Lỗi khi tải file PDF.</p>
              </div>
            )
          ) : (
            <div 
              className="prose max-w-4xl mx-auto select-none"
              style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
              dangerouslySetInnerHTML={{ __html: processedContent }}
              onContextMenu={(e) => {
                if (!canDownload) e.preventDefault();
              }}
            />
          )}
        </div>
      </div>

      {/* Watermark for non-admin users */}
      {!canDownload && (
        <div 
          className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-5"
          style={{ zIndex: 5 }}
        >
          <div className="text-4xl font-bold text-gray-900 rotate-[-30deg] whitespace-nowrap">
            TÀI LIỆU NỘI BỘ - KHÔNG SAO CHÉP
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentViewer;
