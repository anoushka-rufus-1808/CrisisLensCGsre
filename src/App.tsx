import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DataProvider } from "@/context/DataContext";
import { Layout } from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import LiveMap from "@/pages/LiveMap";
import Predictions from "@/pages/Predictions";
import AccuracyBacktest from "@/pages/AccuracyBacktest";
import FacilitiesDB from "@/pages/FacilitiesDB";
import ApiDocs from "@/pages/ApiDocs";
import HistoricalAnalytics from "@/pages/HistoricalAnalytics";
import SchoolRiskForm from "@/pages/SchoolRiskForm";
import Register from "@/pages/Register";
import NotFound from "@/pages/not-found";
import ForecastPanel from "@/components/ForecastPanel";
import FutureRisk from "@/pages/FutureRisk";
import Login from "@/pages/Login";
import ProtectedRoute from "@/components/ProtectedRoute";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      {/* PUBLIC — no login needed */}
      <Route path="/login" component={Login} />

      {/* ALL OTHER ROUTES — must be logged in */}
      <Route>
        <ProtectedRoute>
          <Layout>
            <Switch>
              <Route path="/" component={Dashboard} />
              <Route path="/live-map" component={LiveMap} />
              <Route path="/predictions" component={Predictions} />
              <Route path="/accuracy-backtest" component={AccuracyBacktest} />
              <Route path="/facilities-db" component={FacilitiesDB} />
              <Route path="/api-docs" component={ApiDocs} />
              <Route path="/historical-analytics" component={HistoricalAnalytics} />
              <Route path="/school-risk-form" component={SchoolRiskForm} />
              <Route path="/register" component={Register} />
              <Route path="/forecast" component={ForecastPanel} />
              <Route path="/future-risk" component={FutureRisk} />
              <Route component={NotFound} />
            </Switch>
          </Layout>
        </ProtectedRoute>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <DataProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
        </DataProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;