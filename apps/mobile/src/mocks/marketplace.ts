import type { ProductItem, ProductDetail } from '@mobile/types';
import { IMG_POST_ROOM, IMG_AVATAR_SARAH_COMMUNITY } from './images';

export const MOCK_PRODUCTS: ProductItem[] = [
  {
    id: '1',
    name: 'Premium Stroller',
    price: 320,
    location: 'Chelsea, NY',
    imageHeight: 180,
    favorited: false,
  },
  {
    id: '2',
    name: 'Newborn Bundle',
    price: 45,
    location: 'Brooklyn, NY',
    imageHeight: 130,
    favorited: false,
  },
  {
    id: '3',
    name: 'Wooden Toy Set',
    price: 28,
    location: 'Upper East Side',
    imageHeight: 150,
    favorited: false,
  },
  {
    id: '4',
    name: 'Smart Dispenser',
    price: 65,
    location: 'SoHo, NY',
    imageHeight: 180,
    favorited: false,
  },
  {
    id: '5',
    name: 'Natural Wood Crib',
    price: 150,
    location: 'Jersey City',
    imageHeight: 120,
    favorited: false,
  },
  {
    id: '6',
    name: 'Nursing Pillow',
    price: 22,
    location: 'Williamsburg',
    imageHeight: 160,
    favorited: false,
  },
];

export const MOCK_PRODUCT_DETAIL: ProductDetail = {
  id: '1',
  name: 'Premium Stroller',
  price: 320,
  location: 'Chelsea, NY',
  imageHeight: 180,
  favorited: false,
  description:
    'UppaBaby Vista V2 stroller in excellent condition. Used for 6 months. Includes bassinet, toddler seat, and rain cover. Smoke-free home.',
  condition: 'like_new',
  category: 'Strollers',
  images: [IMG_POST_ROOM, IMG_POST_ROOM, IMG_POST_ROOM],
  seller: {
    name: 'Maria Thompson',
    avatar: IMG_AVATAR_SARAH_COMMUNITY,
    memberSince: 'Jan 2024',
    responseTime: 'Usually within 1 hour',
  },
  postedDate: '2 days ago',
};

export const MOCK_SIMILAR_PRODUCTS: ProductItem[] = [
  { id: '7', name: 'Double Stroller', price: 250, location: 'Brooklyn', imageHeight: 140, favorited: false },
  { id: '8', name: 'Car Seat Adapter', price: 45, location: 'Manhattan', imageHeight: 120, favorited: false },
  { id: '9', name: 'Stroller Organizer', price: 18, location: 'Queens', imageHeight: 130, favorited: false },
];
