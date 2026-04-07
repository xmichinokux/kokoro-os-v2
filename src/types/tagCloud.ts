export type TagCloudItem = {
  tag: string;
  count: number;
  weight: number;
  size: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
};

export type RelatedTagItem = {
  tag: string;
  score: number;
  sharedCount: number;
};

export type NoteTagViewState = {
  selectedTag?: string;
};
