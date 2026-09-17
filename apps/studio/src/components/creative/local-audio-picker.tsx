export type AudioTrack = {
  audio_id: string;
  song: string | null;
  artist: string | null;
};

export function TrendingAudioPicker(_props: {
  selectedAudioId: string | null;
  onSelect(id: string | null, track?: AudioTrack): void;
  accessibleToAll?: boolean;
  libraryOnly?: boolean;
  open?: boolean;
  onOpenChange?(open: boolean): void;
  hideTrigger?: boolean;
}) {
  return null;
}
