
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/components/theme-provider";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import CoachDashboard from './components/dashboard/CoachDashboard';
import RefereeDashboard from './components/dashboard/RefereeDashboard';
import { AuthProvider } from "./contexts/AuthContext";


const queryClient = new QueryClient();

const App = () => (
  <ThemeProvider defaultTheme="light">
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>  {/* ← wrap everything here */}
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/dashboard/coach" element={<CoachDashboard />} />
              <Route path="/dashboard/referee" element={<RefereeDashboard />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>  {/* ← close here */}
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
