import React, { useRef, useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import clsx from 'clsx';
import { 
  Bold, Italic, List, Link as LinkIcon, Image as ImageIcon, 
  Heading1, Heading2, Heading3, Heading4, Heading5, Heading6,
  Table as TableIcon, Save, Download, Upload, X, RotateCcw,
  ListOrdered, CheckSquare, Code, Quote, AlignLeft, AlignCenter, AlignRight,
  Type, GripVertical, Palette, Minus, Indent, Outdent, MessageSquarePlus, Highlighter, FileText, FileCode, Check, AlertCircle, Menu
} from 'lucide-react';

interface DocumentEditorProps {
  initialContent: string;
  onSave: (content: string) => void;
  onCancel: () => void;
  title?: string;
  onUploadComplete?: (content: string, filename: string) => void;
}

interface TOCItem {
  id: string;
  text: string | null;
  level: number;
  element: HTMLElement;
}

const DocumentEditor: React.FC<DocumentEditorProps> = ({ initialContent, onSave, onCancel, title, onUploadComplete }) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [toc, setToc] = useState<TOCItem[]>([]);
  
  // State for upload guidance modal
  const [showUploadGuidance, setShowUploadGuidance] = useState(false);

  // State for download modal
  const [showDownloadModal, setShowDownloadModal] = useState(false);

  // Notification state
  const [notification, setNotification] = useState<{
    show: boolean;
    message: string;
    type: 'success' | 'error';
  }>({ show: false, message: '', type: 'success' });

  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ show: true, message, type });
    setTimeout(() => setNotification(prev => ({ ...prev, show: false })), 3000);
  };

  // State for hover handle and menu
  const [hoveredBlock, setHoveredBlock] = useState<HTMLElement | null>(null);
  const [handlePosition, setHandlePosition] = useState({ top: 0, left: 0 });
  const [showHandle, setShowHandle] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [currentHeading, setCurrentHeading] = useState<'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'>('p');
  
  // We need to keep track of the block that was active when the menu was opened
  const [activeBlock, setActiveBlock] = useState<HTMLElement | null>(null);

  // Timeout ref for delaying hide
  const leaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = initialContent;
      // Ensure paragraphs are used for new lines
      document.execCommand('defaultParagraphSeparator', false, 'p');
      updateToc();
    }
  }, [initialContent]);

  const updateToc = () => {
    if (!editorRef.current) return;
    const headers = editorRef.current.querySelectorAll('h1, h2, h3');
    const tocItems: TOCItem[] = [];
    
    headers.forEach((h, i) => {
        tocItems.push({ 
            id: `toc-${i}`, 
            text: h.textContent, 
            level: parseInt(h.tagName.substring(1)),
            element: h as HTMLElement
        });
    });

    setToc(tocItems);
  };

  const scrollToHeading = (element: HTMLElement) => {
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const getBlockHeading = (block: HTMLElement | null): 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' => {
    if (!block) return 'p';
    const tag = block.tagName.toLowerCase();
    if (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4' || tag === 'h5' || tag === 'h6') {
      return tag;
    }
    return 'p';
  };

  const execCommand = (command: string, value: string | undefined = undefined) => {
    // If we are applying from the block menu, we need to ensure the target block is selected
    if (activeBlock && isMenuOpen) {
      const selection = window.getSelection();
      // Only select the whole block if the user hasn't made a specific selection inside it
      // This prevents inline formatting (color, bold) from applying to the whole block when text is selected
      const isSelectionInside = selection && !selection.isCollapsed && 
                                activeBlock.contains(selection.anchorNode);

      if (!isSelectionInside) {
        const range = document.createRange();
        range.selectNodeContents(activeBlock);
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
    }

    document.execCommand(command, false, value);
    
    if (editorRef.current) {
      editorRef.current.focus();
    }
    
    // Close menu after action
    setIsMenuOpen(false);
    setShowHandle(false);
  };

  const handleSave = () => {
    if (editorRef.current) {
      onSave(editorRef.current.innerHTML);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Client-side validation for extension
    const validTypes = ['.docx', '.html', '.md', '.xlsx', '.pdf'];
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    
    if (!validTypes.includes(ext)) {
        showNotification("Định dạng file không hợp lệ! Chỉ chấp nhận .docx, .xlsx, .html, .md, .pdf", 'error');
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
        document.body.style.cursor = 'wait';
        const res = await (apiClient as any).postMultipart('/documents/upload', formData);
        
        if (res && res.content) {
            // Callback to parent if provided (for both PDF and other types)
            if (onUploadComplete) {
                onUploadComplete(res.content, file.name);
            }

            // Check if it is a PDF
            if (res.content.startsWith('data:application/pdf')) {
                // If onUploadComplete is provided, we assume parent handles the view switch.
                // If NOT provided, we fallback to onSave to force save/reload.
                if (!onUploadComplete) {
                    onSave(res.content);
                }
            } else {
                if (editorRef.current) {
                    editorRef.current.innerHTML = res.content;
                    // Normalize new content
                    document.execCommand('defaultParagraphSeparator', false, 'p');
                }
            }
        }
    } catch (error: any) {
        console.error(error);
        showNotification(error.message || "Lỗi khi tải file. Vui lòng kiểm tra lại định dạng và nội dung file.", 'error');
    } finally {
        document.body.style.cursor = 'default';
        if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const triggerUpload = () => {
    setShowUploadGuidance(true);
  };

  const confirmUpload = () => {
    setShowUploadGuidance(false);
    fileInputRef.current?.click();
  };

  const handleDownload = () => {
    setShowDownloadModal(true);
  };

  const processDownload = (format: 'html' | 'md' | 'txt') => {
    if (!editorRef.current) return;
    
    let content = '';
    let mimeType = '';
    let extension = '';

    switch (format) {
      case 'html':
        content = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${title || 'document'}</title>
<style>
body { font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 2rem; }
img { max-width: 100%; height: auto; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid #ddd; padding: 8px; }
blockquote { border-left: 4px solid #ddd; padding-left: 1rem; color: #666; }
pre { background: #f4f4f4; padding: 1rem; border-radius: 4px; overflow-x: auto; }
</style>
</head>
<body>
${editorRef.current.innerHTML}
</body>
</html>`;
        mimeType = 'text/html';
        extension = 'html';
        break;
      case 'txt':
        content = editorRef.current.innerText;
        mimeType = 'text/plain';
        extension = 'txt';
        break;
      case 'md':
         // Basic HTML to Markdown
         let md = editorRef.current.innerHTML;
         // Headings
         md = md.replace(/<h1.*?>(.*?)<\/h1>/gi, '# $1\n\n');
         md = md.replace(/<h2.*?>(.*?)<\/h2>/gi, '## $1\n\n');
         md = md.replace(/<h3.*?>(.*?)<\/h3>/gi, '### $1\n\n');
         md = md.replace(/<h[4-6].*?>(.*?)<\/h[4-6]>/gi, '#### $1\n\n');
         // Formatting
         md = md.replace(/<strong.*?>(.*?)<\/strong>/gi, '**$1**');
         md = md.replace(/<b.*?>(.*?)<\/b>/gi, '**$1**');
         md = md.replace(/<em.*?>(.*?)<\/em>/gi, '*$1*');
         md = md.replace(/<i.*?>(.*?)<\/i>/gi, '*$1*');
         // Paragraphs and breaks
         md = md.replace(/<p.*?>(.*?)<\/p>/gi, '$1\n\n');
         md = md.replace(/<br.*?>/gi, '\n');
         // Links and Images
         md = md.replace(/<a.*?href="(.*?)".*?>(.*?)<\/a>/gi, '[$2]($1)');
         md = md.replace(/<img.*?src="(.*?)".*?>/gi, '![]($1)');
         // Lists
         md = md.replace(/<ul.*?>/gi, '');
         md = md.replace(/<\/ul>/gi, '\n');
         md = md.replace(/<li.*?>(.*?)<\/li>/gi, '- $1\n');
         // Code
         md = md.replace(/<code.*?>(.*?)<\/code>/gi, '`$1`');
         md = md.replace(/<pre.*?>(.*?)<\/pre>/gi, '```\n$1\n```\n\n');
         // Quotes
         md = md.replace(/<blockquote.*?>(.*?)<\/blockquote>/gi, '> $1\n\n');
         // Clean up
         md = md.replace(/<[^>]*>/g, '');
         
         // Decode entities
         const txt = document.createElement("textarea");
         txt.innerHTML = md;
         content = txt.value;
         
         mimeType = 'text/markdown';
         extension = 'md';
         break;
    }

    const element = document.createElement("a");
    const file = new Blob([content], {type: mimeType});
    element.href = URL.createObjectURL(file);
    element.download = `${title || 'document'}.${extension}`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    setShowDownloadModal(false);
  };

  const insertTable = () => {
    const html = `
      <table style="width:100%; border-collapse: collapse; margin: 1em 0;">
        <thead>
          <tr>
            <th style="border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2;">Header 1</th>
            <th style="border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2;">Header 2</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="border: 1px solid #ddd; padding: 8px;">Cell 1</td>
            <td style="border: 1px solid #ddd; padding: 8px;">Cell 2</td>
          </tr>
          <tr>
            <td style="border: 1px solid #ddd; padding: 8px;">Cell 3</td>
            <td style="border: 1px solid #ddd; padding: 8px;">Cell 4</td>
          </tr>
        </tbody>
      </table>
      <p><br/></p>
    `;
    execCommand('insertHTML', html);
  };

  const insertComment = () => {
    const comment = prompt('Nhập nội dung bình luận:');
    if (comment) {
      const html = `<span title="${comment}" style="background-color: #fef08a; border-bottom: 2px solid #eab308; cursor: help;">${window.getSelection()?.toString() || 'comment'}</span>`;
      execCommand('insertHTML', html);
    }
  };

  // Hover Logic
  
  
  const handleGutterMouseMove = (e: React.MouseEvent) => {
    if (isMenuOpen) return;
    const editor = editorRef.current;
    if (!editor) return;

    // Recursive helper to find the deepest element covering the Y position
    const findDeepest = (root: Element, y: number): Element | null => {
        const children = Array.from(root.children);
        for (const child of children) {
            const rect = child.getBoundingClientRect();
            // Check vertical overlap only (since we are in gutter)
            if (y >= rect.top && y <= rect.bottom) {
                const deeper = findDeepest(child, y);
                return deeper || child;
            }
        }
        return null;
    };

    const mouseY = e.clientY;
    let target = findDeepest(editor, mouseY);

    if (target) {
        // Walk up to find a valid Block element
        while (target && target.parentElement !== editor) {
             if (['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'PRE', 'DIV', 'TABLE'].includes(target.tagName)) break;
             target = target.parentElement as Element;
        }

        setHoveredBlock(target as HTMLElement);
        const editorRect = editor.getBoundingClientRect();
        const blockRect = target.getBoundingClientRect();
        const top = blockRect.top - editorRect.top;
        setHandlePosition({ top, left: 10 });
        setShowHandle(true);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isMenuOpen) return;

    // Clear any pending hide timeout
    if (leaveTimeoutRef.current) {
      clearTimeout(leaveTimeoutRef.current);
      leaveTimeoutRef.current = null;
    }

    const editor = editorRef.current;
    if (!editor) return;

    let target = e.target as HTMLElement;

    // Don't show handle if hovering over the editor container itself
    if (target === editor) return;

    while (target && target.parentElement !== editor) {
      if (['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'PRE', 'DIV', 'TABLE'].includes(target.tagName)) break;
      target = target.parentElement as HTMLElement;
    }

    if (target) {
      setHoveredBlock(target);
      const editorRect = editor.getBoundingClientRect();
      const blockRect = target.getBoundingClientRect();
      
      const top = blockRect.top - editorRect.top;
      
      setHandlePosition({ top, left: 10 });
      setShowHandle(true);
    }
  };

  const handleMouseLeave = () => {
    if (isMenuOpen) return;
    
    // Add delay before hiding
    leaveTimeoutRef.current = setTimeout(() => {
        setShowHandle(false);
    }, 300); // 300ms delay
  };

  const handleMenuEnter = () => {
      // Keep menu open when hovering the menu itself
      if (leaveTimeoutRef.current) {
          clearTimeout(leaveTimeoutRef.current);
          leaveTimeoutRef.current = null;
      }
  };

  const handleGripEnter = () => {
      // Clear hide timeout
      if (leaveTimeoutRef.current) {
          clearTimeout(leaveTimeoutRef.current);
          leaveTimeoutRef.current = null;
      }
      
      // Auto open menu and focus when hovering the handle (Grip)
      if (hoveredBlock) {
          setActiveBlock(hoveredBlock);
          setCurrentHeading(getBlockHeading(hoveredBlock));
          setIsMenuOpen(true);
          
          // Focus the block at the beginning
          const selection = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(hoveredBlock);
          range.collapse(true); // true = start
          selection?.removeAllRanges();
          selection?.addRange(range);
          
          if (editorRef.current) {
              editorRef.current.focus();
          }
      }
  };

  const openMenu = () => {
    if (hoveredBlock) {
      setActiveBlock(hoveredBlock);
      setCurrentHeading(getBlockHeading(hoveredBlock));
      setIsMenuOpen(true);
    }
  };

  const handleMouseUp = () => {
    if (!editorRef.current) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    let node: Node | null = range.commonAncestorContainer;
    if (!node) return;
    const editor = editorRef.current;
    let element = node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement;
    while (element && element.parentElement !== editor && element !== editor) {
      if (['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'PRE', 'DIV', 'TABLE'].includes(element.tagName)) break;
      element = element.parentElement as HTMLElement;
    }
    if (!element || element === editor) return;
    const editorRect = editor.getBoundingClientRect();
    const blockRect = element.getBoundingClientRect();
    const selectionRect = range.getBoundingClientRect();
    const top = selectionRect.top - editorRect.top;
    setHandlePosition({ top, left: 10 });
    setHoveredBlock(element);
    setActiveBlock(element);
    setCurrentHeading(getBlockHeading(element));
    setIsMenuOpen(true);
    setShowHandle(false);
  };

  // Shared Tool buttons
  const HeadingButtons = () => (
      <>
        <button onClick={() => execCommand('formatBlock', 'H1')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700 flex-shrink-0" title="H1">
          <Heading1 size={16} />
        </button>
        <button onClick={() => execCommand('formatBlock', 'H2')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="H2">
          <Heading2 size={16} />
        </button>
        <button onClick={() => execCommand('formatBlock', 'H3')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="H3">
          <Heading3 size={16} />
        </button>
         <button onClick={() => execCommand('formatBlock', 'H4')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="H4">
          <Heading4 size={16} />
        </button>
        <button onClick={() => execCommand('formatBlock', 'H5')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="H5">
          <Heading5 size={16} />
        </button>
        <button onClick={() => execCommand('formatBlock', 'H6')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="H6">
          <Heading6 size={16} />
        </button>
      </>
  );

  return (
    <div className="flex flex-col h-full bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden relative">
      {/* Top Toolbar */}
      <div className="flex items-center gap-1 p-2 border-b border-gray-200 bg-gray-50 overflow-x-auto flex-nowrap md:flex-wrap z-20 relative shrink-0 scrollbar-hide">
        <button onClick={() => execCommand('bold')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700 flex-shrink-0" title="In đậm">
          <Bold size={16} />
        </button>
        <button onClick={() => execCommand('italic')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="In nghiêng">
          <Italic size={16} />
        </button>
        <div className="w-px h-5 bg-gray-300 mx-1 flex-shrink-0"></div>
        
        {/* Headings */}
        <HeadingButtons />
        
        <div className="w-px h-5 bg-gray-300 mx-1"></div>
        
        {/* Lists */}
        <button onClick={() => execCommand('insertUnorderedList')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Danh sách">
          <List size={16} />
        </button>
        <button onClick={() => execCommand('insertOrderedList')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Danh sách số">
          <ListOrdered size={16} />
        </button>
        <button onClick={() => execCommand('insertHTML', '<ul style="list-style:none;"><li><input type="checkbox" />&nbsp;</li></ul>')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Checklist">
            <CheckSquare size={16} />
        </button>
        
        <div className="w-px h-5 bg-gray-300 mx-1"></div>

        {/* Alignment & Indentation */}
        <button onClick={() => execCommand('justifyLeft')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Căn trái">
          <AlignLeft size={16} />
        </button>
        <button onClick={() => execCommand('justifyCenter')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Căn giữa">
          <AlignCenter size={16} />
        </button>
        <button onClick={() => execCommand('justifyRight')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Căn phải">
          <AlignRight size={16} />
        </button>
        <button onClick={() => execCommand('indent')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Thụt lề">
            <Indent size={16} />
        </button>
        <button onClick={() => execCommand('outdent')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Giảm thụt lề">
            <Outdent size={16} />
        </button>

        <div className="w-px h-5 bg-gray-300 mx-1"></div>

        {/* Insert */}
        <button onClick={() => {
          const url = prompt('Nhập đường dẫn liên kết:');
          if (url) execCommand('createLink', url);
        }} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Chèn liên kết">
          <LinkIcon size={16} />
        </button>
        <button onClick={() => {
          const url = prompt('Nhập đường dẫn hình ảnh:');
          if (url) execCommand('insertImage', url);
        }} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Chèn hình ảnh">
          <ImageIcon size={16} />
        </button>
        <button onClick={insertTable} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Chèn bảng">
          <TableIcon size={16} />
        </button>
        <button onClick={() => execCommand('insertHorizontalRule')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Đường kẻ ngang">
          <Minus size={16} />
        </button>
        <button onClick={() => {
          // Check if selection is inside a PRE tag
          const selection = window.getSelection();
          if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            let parent = range.commonAncestorContainer.parentElement;
            let insidePre = false;
            while (parent && parent !== editorRef.current) {
              if (parent.tagName === 'PRE') {
                insidePre = true;
                break;
              }
              parent = parent.parentElement;
            }

            if (insidePre) {
              // If inside PRE, convert back to P (unwrap)
              // This is tricky with execCommand, standard behavior toggles or we use formatBlock 'P'
              execCommand('formatBlock', 'P');
            } else {
              // Wrap in PRE
              execCommand('formatBlock', 'PRE');
            }
          }
        }} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Code Block">
          <Code size={16} />
        </button>
        <button onClick={() => execCommand('formatBlock', 'BLOCKQUOTE')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Trích dẫn">
          <Quote size={16} />
        </button>
        <button onClick={insertComment} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Bình luận">
          <MessageSquarePlus size={16} />
        </button>
        
        {/* Colors (Simple Dropdown Trigger) */}
        <div className="relative group flex-shrink-0">
            <button className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Màu sắc">
                <Palette size={16} />
            </button>
            <div className="absolute top-full left-0 hidden group-hover:flex bg-white shadow-lg border border-gray-200 p-2 rounded gap-1 z-50">
                 {['#000000', '#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899'].map(color => (
                    <button 
                        key={color}
                        onClick={() => execCommand('foreColor', color)}
                        className="w-5 h-5 rounded-full border border-gray-200 hover:scale-110"
                        style={{ backgroundColor: color }}
                    />
                ))}
            </div>
        </div>
        
        <div className="flex-1"></div>

        <div className="flex items-center gap-2">
            <button 
                className="p-1.5 hover:bg-gray-200 rounded text-gray-700 cursor-pointer" 
                title="Tải lên tài liệu"
                onClick={triggerUpload}
            >
                <Upload size={16} />
            </button>
            <input 
                ref={fileInputRef}
                type="file" 
                accept=".docx,.html,.md,.xlsx,.pdf" 
                className="hidden" 
                onChange={handleUpload} 
            />
            <button onClick={handleDownload} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Tải xuống">
                <Download size={16} />
            </button>
            <div className="w-px h-5 bg-gray-300 mx-1"></div>
            <button onClick={onCancel} className="px-3 py-1.5 text-gray-600 hover:bg-gray-100 rounded text-sm font-medium">
                Hủy
            </button>
            <button onClick={handleSave} className="px-3 py-1.5 bg-primary text-white hover:bg-primary/90 rounded text-sm font-medium flex items-center gap-1">
                <Save size={16} />
                Lưu
            </button>
        </div>
      </div>

      {/* Upload Guidance Modal */}
      {showUploadGuidance && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="font-semibold text-gray-900">Hướng dẫn tải lên</h3>
              <button onClick={() => setShowUploadGuidance(false)} className="text-gray-500 hover:text-gray-700">
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              <p className="text-gray-700 mb-4">
                Hệ thống chỉ chấp nhận các định dạng tài liệu:
              </p>
              <div className="flex gap-2 justify-center mb-6 flex-wrap">
                <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">.docx</span>
                <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">.xlsx</span>
                <span className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-sm font-medium">.html</span>
                <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm font-medium">.md</span>
                <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-medium">.pdf</span>
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowUploadGuidance(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  Hủy
                </button>
                <button 
                  onClick={confirmUpload}
                  className="flex-1 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors font-medium flex items-center justify-center gap-2"
                >
                  <Upload size={18} />
                  Chọn file
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Download Modal */}
      {showDownloadModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="font-semibold text-gray-900">Chọn định dạng tải xuống</h3>
              <button onClick={() => setShowDownloadModal(false)} className="text-gray-500 hover:text-gray-700">
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 gap-3">
                <button 
                  onClick={() => processDownload('html')}
                  className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-orange-50 hover:border-orange-200 transition-all group text-left"
                >
                  <div className="p-2 bg-orange-100 text-orange-600 rounded-lg group-hover:bg-orange-200">
                    <FileCode size={24} />
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">HTML Document</div>
                    <div className="text-xs text-gray-500">.html - Trang web đầy đủ</div>
                  </div>
                </button>

                <button 
                  onClick={() => processDownload('md')}
                  className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-blue-50 hover:border-blue-200 transition-all group text-left"
                >
                  <div className="p-2 bg-blue-100 text-blue-600 rounded-lg group-hover:bg-blue-200">
                    <FileCode size={24} />
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">Markdown</div>
                    <div className="text-xs text-gray-500">.md - Định dạng văn bản đơn giản</div>
                  </div>
                </button>

                <button 
                  onClick={() => processDownload('txt')}
                  className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-200 transition-all group text-left"
                >
                  <div className="p-2 bg-gray-100 text-gray-600 rounded-lg group-hover:bg-gray-200">
                    <FileText size={24} />
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">Plain Text</div>
                    <div className="text-xs text-gray-500">.txt - Chỉ văn bản thô</div>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {notification.show && (
        <div className={`fixed bottom-4 right-4 z-[110] flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg animate-in slide-in-from-bottom-5 duration-300 ${
          notification.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {notification.type === 'success' ? <Check size={20} /> : <AlertCircle size={20} />}
          <span className="font-medium">{notification.message}</span>
          <button onClick={() => setNotification(prev => ({ ...prev, show: false }))} className="ml-2 hover:opacity-70">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Content Area */}
      <div className="flex-1 relative overflow-hidden flex">
        {/* TOC Sidebar */}
        <div className="w-64 border-r border-gray-200 bg-gray-50 overflow-y-auto p-4 flex-shrink-0 hidden md:block">
            <div className="flex items-center gap-2 mb-4 text-gray-900 font-medium">
                <Menu size={18} />
                <span>Mục lục</span>
            </div>
            <nav className="space-y-1">
                {toc.length === 0 && (
                    <p className="text-sm text-gray-500 italic pl-2">Chưa có tiêu đề</p>
                )}
                {toc.map((item) => (
                    <button
                        key={item.id}
                        onClick={() => scrollToHeading(item.element)}
                        className={clsx(
                            "block w-full text-left text-sm py-1.5 pr-2 hover:text-primary transition-colors truncate",
                            item.level === 1 ? "pl-2 font-medium text-gray-800" :
                            item.level === 2 ? "pl-6 text-gray-600" :
                            "pl-10 text-gray-500"
                        )}
                        title={item.text || ''}
                    >
                        {item.text || '(Không có tiêu đề)'}
                    </button>
                ))}
            </nav>
        </div>

        {/* Handle Area (Left Gutter) */}
        <div className="hidden md:block w-12 bg-gray-50 border-r border-gray-100 flex-shrink-0 relative z-20" onMouseMove={handleGutterMouseMove}>
           {showHandle && (
             <button
                className="absolute right-0 w-full p-1 hover:bg-gray-200 rounded cursor-pointer text-gray-400 hover:text-gray-600 transition-colors flex justify-center"
                style={{ top: handlePosition.top }}
                onClick={handleGripEnter}
                onMouseEnter={handleGripEnter}
                title="Click để mở menu"
             >
                <GripVertical size={18} />
             </button>
           )}

           {/* Floating Block Menu (Moved to Handle Area to overlay Sidebar) */}
           {isMenuOpen && (
                <div 
                    className="absolute z-50 bg-white shadow-xl border border-gray-200 rounded-lg p-2 w-72 animate-in fade-in zoom-in-95 duration-100 left-full ml-2 md:-left-64 md:ml-0"
                    style={{ 
                        top: handlePosition.top, // Aligned with handle
                    }}
                    onMouseEnter={handleMenuEnter}
                >
                    {/* Close Overlay */}
                    <div className="fixed inset-0 z-[-1]" onClick={() => setIsMenuOpen(false)}></div>

                    <div className="grid grid-cols-6 gap-1 mb-2">
                        <button onMouseDown={(e) => e.preventDefault()} onClick={() => execCommand('formatBlock', 'P')}
                            className={clsx(
                                "p-2 hover:bg-gray-100 rounded flex items-center justify-center text-gray-700",
                                currentHeading === 'p' && "bg-primary/10 text-primary"
                            )}
                            title="Text"
                        >
                            <Type size={18} />
                        </button>
                        <button onMouseDown={(e) => e.preventDefault()} onClick={() => execCommand('formatBlock', 'H1')}
                            className={clsx(
                                "p-2 hover:bg-gray-100 rounded flex items-center justify-center text-gray-700",
                                currentHeading === 'h1' && "bg-primary/10 text-primary"
                            )}
                            title="H1"
                        >
                            <Heading1 size={18} />
                        </button>
                        <button onMouseDown={(e) => e.preventDefault()} onClick={() => execCommand('formatBlock', 'H2')}
                            className={clsx(
                                "p-2 hover:bg-gray-100 rounded flex items-center justify-center text-gray-700",
                                currentHeading === 'h2' && "bg-primary/10 text-primary"
                            )}
                            title="H2"
                        >
                            <Heading2 size={18} />
                        </button>
                        <button onMouseDown={(e) => e.preventDefault()} onClick={() => execCommand('formatBlock', 'H3')}
                            className={clsx(
                                "p-2 hover:bg-gray-100 rounded flex items-center justify-center text-gray-700",
                                currentHeading === 'h3' && "bg-primary/10 text-primary"
                            )}
                            title="H3"
                        >
                            <Heading3 size={18} />
                        </button>
                        <button onMouseDown={(e) => e.preventDefault()} onClick={() => execCommand('formatBlock', 'H4')}
                            className={clsx(
                                "p-2 hover:bg-gray-100 rounded flex items-center justify-center text-gray-700",
                                currentHeading === 'h4' && "bg-primary/10 text-primary"
                            )}
                            title="H4"
                        >
                            <Heading4 size={18} />
                        </button>
                        <button onMouseDown={(e) => e.preventDefault()} onClick={() => execCommand('formatBlock', 'H5')}
                            className={clsx(
                                "p-2 hover:bg-gray-100 rounded flex items-center justify-center text-gray-700",
                                currentHeading === 'h5' && "bg-primary/10 text-primary"
                            )}
                            title="H5"
                        >
                            <Heading5 size={18} />
                        </button>
                    </div>

                    <div className="grid grid-cols-6 gap-1 mb-2">
                        <button onMouseDown={(e) => e.preventDefault()} onClick={() => execCommand('formatBlock', 'H6')}
                            className={clsx(
                                "p-2 hover:bg-gray-100 rounded flex items-center justify-center text-gray-700",
                                currentHeading === 'h6' && "bg-primary/10 text-primary"
                            )}
                            title="H6"
                        >
                            <Heading6 size={18} />
                        </button>
                        <button onMouseDown={(e) => e.preventDefault()} onClick={() => execCommand('insertOrderedList')} className="p-2 hover:bg-gray-100 rounded flex items-center justify-center text-gray-700" title="Danh sách số">
                            <ListOrdered size={18} />
                        </button>
                        <button onMouseDown={(e) => e.preventDefault()} onClick={() => execCommand('insertUnorderedList')} className="p-2 hover:bg-gray-100 rounded flex items-center justify-center text-gray-700" title="Danh sách">
                            <List size={18} />
                        </button>
                        <button onMouseDown={(e) => e.preventDefault()} onClick={() => execCommand('insertHTML', '<ul style="list-style:none;"><li><input type="checkbox" />&nbsp;</li></ul>')} className="p-2 hover:bg-gray-100 rounded flex items-center justify-center text-gray-700" title="Checklist">
                            <CheckSquare size={18} />
                        </button>
                        <button onMouseDown={(e) => e.preventDefault()} onClick={() => execCommand('formatBlock', 'PRE')} className="p-2 hover:bg-gray-100 rounded flex items-center justify-center text-gray-700" title="Code">
                            <Code size={18} />
                        </button>
                        <button onMouseDown={(e) => e.preventDefault()} onClick={() => execCommand('formatBlock', 'BLOCKQUOTE')} className="p-2 hover:bg-gray-100 rounded flex items-center justify-center text-gray-700" title="Quote">
                            <Quote size={18} />
                        </button>
                    </div>

                    <div className="border-t border-gray-100 my-1 pt-1 flex gap-1">
                        <button onMouseDown={(e) => e.preventDefault()} onClick={() => execCommand('insertHorizontalRule')} className="flex-1 p-2 hover:bg-gray-100 rounded flex items-center justify-center text-gray-700" title="Divider">
                            <Minus size={18} />
                        </button>
                        <button onMouseDown={(e) => e.preventDefault()} onClick={() => {
                            const url = prompt('Nhập đường dẫn:');
                            if (url) execCommand('createLink', url);
                        }} className="flex-1 p-2 hover:bg-gray-100 rounded flex items-center justify-center text-gray-700" title="Link">
                            <LinkIcon size={18} />
                        </button>
                        <button onMouseDown={(e) => e.preventDefault()} onClick={insertComment} className="flex-1 p-2 hover:bg-gray-100 rounded flex items-center justify-center text-gray-700" title="Comment">
                            <MessageSquarePlus size={18} />
                        </button>
                    </div>
                    
                    <div className="border-t border-gray-100 my-1 pt-1">
                         <div className="text-xs text-gray-500 px-2 mb-1">Căn lề</div>
                         <div className="flex gap-1">
                            <button onMouseDown={(e) => e.preventDefault()} onClick={() => execCommand('justifyLeft')} className="flex-1 p-2 hover:bg-gray-100 rounded flex items-center justify-center text-gray-700">
                                <AlignLeft size={18} />
                            </button>
                            <button onMouseDown={(e) => e.preventDefault()} onClick={() => execCommand('justifyCenter')} className="flex-1 p-2 hover:bg-gray-100 rounded flex items-center justify-center text-gray-700">
                                <AlignCenter size={18} />
                            </button>
                            <button onMouseDown={(e) => e.preventDefault()} onClick={() => execCommand('justifyRight')} className="flex-1 p-2 hover:bg-gray-100 rounded flex items-center justify-center text-gray-700">
                                <AlignRight size={18} />
                            </button>
                            <button onMouseDown={(e) => e.preventDefault()} onClick={() => execCommand('indent')} className="flex-1 p-2 hover:bg-gray-100 rounded flex items-center justify-center text-gray-700">
                                <Indent size={18} />
                            </button>
                            <button onMouseDown={(e) => e.preventDefault()} onClick={() => execCommand('outdent')} className="flex-1 p-2 hover:bg-gray-100 rounded flex items-center justify-center text-gray-700">
                                <Outdent size={18} />
                            </button>
                         </div>
                    </div>

                    <div className="border-t border-gray-100 my-1 pt-1">
                         <div className="text-xs text-gray-500 px-2 mb-1">Màu sắc</div>
                         <div className="flex gap-1 flex-wrap px-1">
                            {['#000000', '#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899'].map(color => (
                                <button onMouseDown={(e) => e.preventDefault()} key={color}
                                    onClick={() => execCommand('foreColor', color)}
                                    className="w-6 h-6 rounded-full border border-gray-200 hover:scale-110 transition-transform"
                                    style={{ backgroundColor: color }}
                                    title={color}
                                />
                            ))}
                         </div>
                    </div>

                </div>
            )}
        </div>

        {/* Editor */}
        <div 
            className="flex-1 overflow-auto bg-white relative" 
            onMouseMove={handleMouseMove} 
            onMouseLeave={handleMouseLeave} 
            onMouseUp={handleMouseUp}
            onScroll={() => {
                setShowHandle(false);
                setIsMenuOpen(false);
            }}
        >
          <style>{`
            .prose h1 { font-size: 2em; font-weight: bold; margin-bottom: 0.5em; }
            .prose h2 { font-size: 1.5em; font-weight: bold; margin-bottom: 0.5em; }
            .prose h3 { font-size: 1.17em; font-weight: bold; margin-bottom: 0.5em; }
            .prose p { margin-bottom: 1em; line-height: 1.6; }
            .prose ul { list-style-type: disc; padding-left: 1.5em; margin-bottom: 1em; }
            .prose ol { list-style-type: decimal; padding-left: 1.5em; margin-bottom: 1em; }
            .prose blockquote { border-left: 4px solid #e5e7eb; padding-left: 1em; font-style: italic; color: #4b5563; }
            .prose pre { 
              background-color: #f3f4f6; 
              padding: 0.75rem 1rem; 
              border-radius: 0.5rem; 
              font-family: monospace; 
              margin: 1em 0;
              white-space: pre-wrap;
              color: #1f2937;
              border: 1px solid #e5e7eb;
              width: fit-content;
              max-width: 100%;
            }
            .prose code { 
              background-color: #f3f4f6; 
              padding: 0.2em 0.4em; 
              border-radius: 0.25em; 
              font-family: monospace; 
              font-size: 0.9em;
              color: #ef4444;
            }
            .prose a { color: #2563eb; text-decoration: underline; }
            .prose img { max-width: 100%; height: auto; border-radius: 0.5rem; }
            .prose table { width: 100%; border-collapse: collapse; margin-bottom: 1em; }
            .prose th, .prose td { border: 1px solid #e5e7eb; padding: 0.5em; }
            .prose th { background-color: #f9fafb; font-weight: 600; }
          `}</style>
          <div 
            ref={editorRef}
            className="min-h-full p-4 md:p-8 outline-none prose max-w-none"
            contentEditable
            suppressContentEditableWarning
            style={{ minHeight: '500px' }}
            onInput={updateToc}
          >
          </div>
          
        </div>

      </div>
    </div>
  );
};

export default DocumentEditor;
