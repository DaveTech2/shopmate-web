import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { AuthProvider } from "./state/auth";
import { ShopProvider } from "./state/shop";
import Landing from "./pages/Landing";
import AuthPage from "./pages/AuthPage";
import Shop from "./pages/Shop";
import Discover from "./pages/Discover";
import ProductPage from "./pages/ProductPage";
import Compare from "./pages/Compare";
import Cart from "./pages/Cart";
import Checkout from "./pages/Checkout";
import Orders from "./pages/Orders";

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

export default function App() {
  return (
    <AuthProvider>
      <ShopProvider>
        <BrowserRouter>
          <ScrollTop />
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/signup" element={<AuthPage mode="signup" />} />
            <Route path="/login" element={<AuthPage mode="login" />} />
            <Route path="/shop" element={<Shop />} />
            <Route path="/discover" element={<Discover />} />
            <Route path="/p/:id" element={<ProductPage />} />
            <Route path="/compare" element={<Compare />} />
            <Route path="/cart" element={<Cart />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="*" element={<Landing />} />
          </Routes>
        </BrowserRouter>
      </ShopProvider>
    </AuthProvider>
  );
}
