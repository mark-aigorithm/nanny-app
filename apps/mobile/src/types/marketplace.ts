export interface ProductItem {
  id: string;
  name: string;
  price: number;
  location: string;
  imageHeight: number;
  favorited: boolean;
}

export interface ProductDetail extends ProductItem {
  description: string;
  condition: 'new' | 'like_new' | 'good' | 'fair';
  category: string;
  images: string[];
  seller: {
    name: string;
    avatar: string;
    memberSince: string;
    responseTime: string;
  };
  postedDate: string;
}
