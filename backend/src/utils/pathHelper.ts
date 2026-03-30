import path from 'path';

export const getRootDir = () => {
  // ts-node: backend/src/utils → hai cấp lên backend/
  // production: backend/dist/src/utils → ba cấp lên backend/
  let root = path.resolve(__dirname, '../../');
  if (path.basename(root) === 'dist') {
    root = path.resolve(root, '..');
  }
  return root;
};

export const getUploadDir = (subDir: string = '') => {
  return path.join(getRootDir(), 'uploads', subDir);
};
