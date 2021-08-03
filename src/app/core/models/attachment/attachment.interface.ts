import { Link } from 'ish-core/models/link/link.model';

export interface AttachmentData {
  name: string;
  type: string;
  description?: string;
  link: Link;
}
