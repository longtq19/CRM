
export const calculateDiff = (original: any, updated: any, excludeKeys: string[] = ['id', 'password', 'createdAt', 'updatedAt']): string => {
  const changes: string[] = [];
  
  // Check for modified or added keys
  Object.keys(updated).forEach(key => {
    if (excludeKeys.includes(key)) return;
    
    // If original doesn't have the key or value is different
    if (original[key] !== updated[key]) {
      // Handle simple values for now. For objects/arrays, simple JSON stringify might be needed or deep diff (keeping it simple for now)
      const oldVal = original[key] !== undefined ? original[key] : '(trống)';
      const newVal = updated[key] !== undefined ? updated[key] : '(trống)';
      
      changes.push(`${key}: "${oldVal}" -> "${newVal}"`);
    }
  });

  return changes.length > 0 ? changes.join(', ') : 'Không có thay đổi';
};
