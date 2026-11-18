import { AuthProvider } from "./auth.js";
import { Footer } from "./components/Footer.js";
import { Header } from "./components/Header.js";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage.js";
import { LoginPage } from "./pages/LoginPage.js";
import { NotFoundPage } from "./pages/NotFoundPage.js";
import { RegisterPage } from "./pages/RegisterPage.js";
import { ResetPasswordPage } from "./pages/ResetPasswordPage.js";
import { ShopPage } from "./pages/ShopPage.js";
import { useLocation } from "./router.js";

const PAGES: Record<string, () => JSX.Element> = {
  "/": ShopPage,
  "/login": LoginPage,
  "/register": RegisterPage,
  "/forgot-password": ForgotPasswordPage,
  "/reset-password": ResetPasswordPage,
};

export default function App() {
  const Page = PAGES[useLocation().pathname] ?? NotFoundPage;
  return (
    <AuthProvider>
      <Header />
      <main className="container page">
        <Page />
      </main>
      <Footer />
    </AuthProvider>
  );
}
