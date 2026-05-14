export type UserRole = 'admin' | 'seller' | 'client';

export interface UserProfile {
  uid: string;
  email: string;
  role: UserRole;
  restaurantId?: string;
  name?: string;
  createdAt: any;
}

export type OrderStatus = 'pending' | 'preparing' | 'ready' | 'delivered' | 'cancelled';

export interface Restaurant {
  id: string;
  name: string;
  slug: string;
  description: string;
  logoUrl?: string;
  themeColor: string;
  ownerId: string;
  createdAt: any;
  tables?: string[];
}

export interface Category {
  id: string;
  restaurantId: string;
  name: string;
  order: number;
}

export interface Product {
  id: string;
  restaurantId: string;
  categoryId: string;
  name: string;
  description: string;
  price: number;
  imageUrl?: string;
  isAvailable: boolean;
}

export interface OrderItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
}

export interface Order {
  id: string;
  restaurantId: string;
  tableNumber: string;
  items: OrderItem[];
  total: number;
  status: OrderStatus;
  createdAt: any; // Firestore Timestamp
  customerName?: string;
  customerPhone?: string;
}
