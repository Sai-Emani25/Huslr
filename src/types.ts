export interface User {
  id: number;
  name: string;
  username: string;
  email: string;
  is_banned: number;
  is_verified: number;
  balance: number;
}

export interface Listing {
  id: number;
  user_id: number;
  type: 'task' | 'rental';
  title: string;
  description: string;
  price: number;
  category: string;
  status: string;
  commission_paid: number;
  image_url?: string;
  owner_name?: string;
}

export interface Transaction {
  id: number;
  listing_id: number;
  buyer_id: number;
  amount: number;
  fee: number;
  duration: string;
  due_date: string;
  timestamp: string;
  title?: string;
  type?: 'task' | 'rental';
  image_url?: string;
  owner_name?: string;
}

export interface Message {
  id: number;
  sender_id: number;
  receiver_id: number;
  listing_id: number;
  content: string;
  timestamp: string;
  sender_name?: string;
}
