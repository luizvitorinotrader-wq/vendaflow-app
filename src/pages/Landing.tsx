import { useNavigate } from 'react-router-dom';
import {
  Store,
  BarChart3,
  Users,
  Package,
  DollarSign,
  Smartphone,
  Check,
  X,
  TrendingDown,
  Clock,
  AlertCircle,
  Zap,
  Shield,
  Award,
  ChevronDown,
  ArrowRight
} from 'lucide-react';
import { useState } from 'react';

export default function Landing() {
  const navigate = useNavigate();
  const [openFAQ, setOpenFAQ] = useState<number | null>(null);

  const trackEvent = (eventName: string) => {
    if (typeof window !== 'undefined' && window.plausible) {
      window.plausible(eventName);
    }
  };

  const painPoints = [
    {
      icon: <TrendingDown className="w-6 h-6" />,
      title: 'Não sabe quanto vende por dia',
      description: 'Perde dinheiro sem saber onde'
    },
    {
      icon: <Package className="w-6 h-6" />,
      title: 'Perde controle do estoque',
      description: 'Produtos faltam ou ficam parados'
    },
    {
      icon: <Clock className="w-6 h-6" />,
      title: 'Demora no atendimento',
      description: 'Clientes desistem e vão embora'
    },
    {
      icon: <AlertCircle className="w-6 h-6" />,
      title: 'Erros no caixa',
      description: 'Dinheiro que entra não fecha no final'
    },
    {
      icon: <X className="w-6 h-6" />,
      title: 'Clientes indo embora',
      description: 'Fila grande afasta quem ia comprar'
    },
  ];

  const benefits = [
    {
      icon: <Zap className="w-6 h-6" />,
      title: 'Venda mais rápido no PDV',
      description: 'Atenda em segundos, não em minutos. Clientes felizes, mais vendas no dia.'
    },
    {
      icon: <DollarSign className="w-6 h-6" />,
      title: 'Controle total do caixa em tempo real',
      description: 'Saiba exatamente quanto entrou, quanto saiu, e onde está cada centavo.'
    },
    {
      icon: <BarChart3 className="w-6 h-6" />,
      title: 'Saiba exatamente o que vende mais',
      description: 'Veja quais produtos dão lucro e quais só ocupam espaço. Decida com dados.'
    },
    {
      icon: <Package className="w-6 h-6" />,
      title: 'Organize seus produtos sem complicação',
      description: 'Cadastro rápido, categorias claras, estoque sob controle. Simples assim.'
    },
    {
      icon: <Smartphone className="w-6 h-6" />,
      title: 'Tenha tudo na palma da mão',
      description: 'Celular, tablet, computador. Funciona em todos, de qualquer lugar.'
    },
  ];

  const systemDemo = [
    {
      title: 'PDV Rápido',
      description: 'Venda em segundos com interface otimizada para velocidade',
      color: 'from-green-500 to-emerald-600'
    },
    {
      title: 'Dashboard Inteligente',
      description: 'Veja suas vendas, lucros e métricas do dia em tempo real',
      color: 'from-blue-500 to-cyan-600'
    },
    {
      title: 'Categorias e Produtos',
      description: 'Organize tudo de forma clara e encontre produtos na hora',
      color: 'from-purple-500 to-pink-600'
    },
    {
      title: 'Controle de Caixa',
      description: 'Abra, feche e controle cada movimento financeiro do seu negócio',
      color: 'from-orange-500 to-red-600'
    },
  ];

  const plans = [
    {
      name: 'Starter',
      price: 'R$ 39,90',
      subtitle: 'Ideal para começar',
      buttonText: 'Começar teste grátis',
      buttonAction: () => {
        trackEvent('plan_starter_click');
        trackEvent('start_trial_click');
        navigate('/register');
      },
      features: [
        'Cadastro de produtos',
        'Controle básico de vendas',
        'Relatório diário simples',
        'Acesso mobile e desktop',
        'Suporte por email',
      ],
    },
    {
      name: 'Pro',
      price: 'R$ 79,90',
      popular: true,
      subtitle: 'Melhor custo-benefício',
      buttonText: 'Começar agora',
      buttonAction: () => {
        trackEvent('plan_pro_click');
        trackEvent('start_trial_click');
        navigate('/register');
      },
      features: [
        'Tudo do Starter',
        'PDV completo e rápido',
        'Controle de caixa profissional',
        'Categorias e gestão avançada',
        'Relatórios detalhados',
        'Controle de estoque',
        'Múltiplos usuários (até 3)',
        'Suporte prioritário',
      ],
    },
    {
      name: 'Premium',
      price: 'R$ 149,90',
      subtitle: 'Recursos avançados',
      buttonText: 'Falar com especialista',
      buttonAction: () => {
        trackEvent('plan_premium_click');
        navigate('/register');
      },
      features: [
        'Tudo do Pro',
        'Usuários ilimitados',
        'Comandas e mesas',
        'Fichas técnicas de produtos',
        'Gestão de clientes',
        'Análises avançadas',
        'API para integrações',
        'Atendimento prioritário',
      ],
    },
  ];

  const faqs = [
    {
      question: 'Preciso instalar algo?',
      answer: 'Não! O VendaFlow funciona direto no navegador. Basta acessar de qualquer dispositivo conectado à internet e começar a usar.'
    },
    {
      question: 'Funciona no celular?',
      answer: 'Sim! O sistema foi desenvolvido mobile-first. Funciona perfeitamente em celular, tablet e computador. Você escolhe como usar.'
    },
    {
      question: 'Posso cancelar quando quiser?',
      answer: 'Sim, sem letras miúdas. Cancele quando quiser direto no painel. Sem multas, sem burocracia. Seus dados ficam salvos por 30 dias caso mude de ideia.'
    },
    {
      question: 'Tem suporte?',
      answer: 'Sim! Todos os planos incluem suporte. O plano Pro tem prioridade no atendimento, e o Premium tem atendimento prioritário com tempo de resposta mais rápido.'
    },
    {
      question: 'Serve para quais tipos de negócio?',
      answer: 'Qualquer comércio que vende produtos: açaí, lanchonete, cafeteria, loja de roupas, mercadinho, farmácia, e muito mais. Se você vende, o VendaFlow organiza.'
    },
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="border-b border-gray-200 bg-white sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-2">
              <div className="bg-gradient-to-r from-green-500 to-green-600 p-2 rounded-lg">
                <Store className="w-6 h-6 text-white" />
              </div>
              <span className="text-xl font-bold text-gray-900">VendaFlow</span>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate('/login')}
                className="text-gray-700 hover:text-gray-900 font-medium transition hidden sm:block"
              >
                Entrar
              </button>
              <button
                onClick={() => {
                  trackEvent('start_trial_click');
                  navigate('/register');
                }}
                className="bg-gradient-to-r from-green-500 to-green-600 text-white px-4 sm:px-6 py-2 rounded-lg font-semibold hover:from-green-600 hover:to-green-700 transition shadow-md"
              >
                Começar grátis
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-green-50 via-emerald-50 to-green-50 pt-16 pb-20 sm:pt-20 sm:pb-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:grid lg:grid-cols-2 lg:gap-12 items-center">
            <div className="text-center lg:text-left">
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 mb-6 leading-tight">
                Controle total do seu negócio na palma da mão —
                <span className="block mt-2 bg-gradient-to-r from-green-600 to-emerald-600 text-transparent bg-clip-text">
                  venda mais todos os dias, sem complicação
                </span>
              </h1>
              <p className="text-lg sm:text-xl text-gray-600 mb-8 max-w-2xl mx-auto lg:mx-0">
                Sistema simples, rápido e feito para quem não tem tempo a perder. Teste grátis hoje.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                <button
                  onClick={() => {
                    trackEvent('cta_hero_click');
                    trackEvent('start_trial_click');
                    navigate('/register');
                  }}
                  className="bg-gradient-to-r from-green-500 to-green-600 text-white px-8 py-4 rounded-lg font-semibold text-lg hover:from-green-600 hover:to-green-700 transition shadow-lg flex items-center justify-center group"
                >
                  Começar teste grátis
                  <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                </button>
                <button
                  onClick={() => {
                    trackEvent('cta_view_plans');
                    document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="bg-white text-gray-900 px-8 py-4 rounded-lg font-semibold text-lg hover:bg-gray-50 transition border-2 border-gray-200 shadow-md"
                >
                  Ver planos
                </button>
              </div>
              <p className="mt-6 text-sm text-gray-500 flex items-center justify-center lg:justify-start gap-2">
                <Check className="w-4 h-4 text-green-600" />
                Teste grátis por 7 dias • Sem cartão • Cancele quando quiser
              </p>
            </div>

            {/* Visual Demo */}
            <div className="mt-12 lg:mt-0">
              <div className="relative">
                <div className="bg-white rounded-2xl shadow-2xl p-6 border border-gray-200">
                  <div className="flex items-center gap-2 mb-4 pb-4 border-b border-gray-200">
                    <div className="w-3 h-3 rounded-full bg-red-500"></div>
                    <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                    <div className="w-3 h-3 rounded-full bg-green-500"></div>
                    <span className="ml-2 text-sm text-gray-600 font-medium">VendaFlow Dashboard</span>
                  </div>
                  <div className="space-y-3">
                    <div className="bg-gradient-to-r from-green-500 to-emerald-600 p-4 rounded-lg text-white">
                      <div className="text-sm opacity-90 mb-1">Vendas Hoje</div>
                      <div className="text-3xl font-bold">R$ 2.847,50</div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                        <div className="text-xs text-gray-600 mb-1">Produtos vendidos</div>
                        <div className="text-xl font-bold text-gray-900">127</div>
                      </div>
                      <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                        <div className="text-xs text-gray-600 mb-1">Ticket médio</div>
                        <div className="text-xl font-bold text-gray-900">R$ 32,40</div>
                      </div>
                    </div>
                    <div className="pt-2">
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span className="text-gray-600">Açaí 500ml</span>
                        <span className="font-semibold text-gray-900">45 vendas</span>
                      </div>
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span className="text-gray-600">X-Burger</span>
                        <span className="font-semibold text-gray-900">32 vendas</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">Suco Natural</span>
                        <span className="font-semibold text-gray-900">28 vendas</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="absolute -bottom-4 -right-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white p-4 rounded-xl shadow-xl">
                  <div className="text-xs opacity-90 mb-1">PDV Ativo</div>
                  <div className="text-2xl font-bold">Pronto para vender</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pain Points Section */}
      <section className="py-16 sm:py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Seu negócio está perdendo dinheiro sem você perceber
            </h2>
            <p className="text-lg sm:text-xl text-gray-600 max-w-3xl mx-auto">
              Reconhece algum desses problemas no seu dia a dia?
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-6">
            {painPoints.map((pain, index) => (
              <div key={index} className="bg-white p-6 rounded-xl border-2 border-red-100 hover:border-red-200 transition group">
                <div className="bg-red-50 text-red-600 w-12 h-12 rounded-lg flex items-center justify-center mb-4 group-hover:bg-red-100 transition">
                  {pain.icon}
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{pain.title}</h3>
                <p className="text-sm text-gray-600">{pain.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-16 sm:py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Com o VendaFlow, tudo fica simples
            </h2>
            <p className="text-lg sm:text-xl text-gray-600 max-w-3xl mx-auto">
              Um sistema que resolve seus problemas de verdade
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {benefits.map((benefit, index) => (
              <div key={index} className="p-6 rounded-xl border-2 border-gray-100 hover:border-green-200 hover:shadow-lg transition group">
                <div className="bg-gradient-to-r from-green-500 to-emerald-600 text-white w-12 h-12 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  {benefit.icon}
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">{benefit.title}</h3>
                <p className="text-gray-600">{benefit.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* System Demo Section */}
      <section className="py-16 sm:py-20 bg-gradient-to-br from-gray-900 to-gray-800 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Veja como é simples usar
            </h2>
            <p className="text-lg sm:text-xl text-gray-300 max-w-3xl mx-auto">
              Tudo que você precisa para vender mais, em uma interface clara e rápida
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {systemDemo.map((demo, index) => (
              <div key={index} className="group cursor-pointer">
                <div className={`bg-gradient-to-br ${demo.color} p-8 rounded-xl shadow-lg group-hover:scale-105 transition-transform h-48 flex flex-col justify-between`}>
                  <div>
                    <h3 className="text-2xl font-bold mb-2">{demo.title}</h3>
                    <p className="text-white/90 text-sm">{demo.description}</p>
                  </div>
                  <div className="flex justify-end">
                    <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center group-hover:bg-white/30 transition">
                      <ArrowRight className="w-5 h-5" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-16 sm:py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Planos para todos os tamanhos de negócio
            </h2>
            <p className="text-lg sm:text-xl text-gray-600 max-w-3xl mx-auto">
              Teste grátis por 7 dias. Sem cartão de crédito. Cancele quando quiser.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 mb-8">
            {plans.map((plan, index) => (
              <div
                key={index}
                className={`bg-white rounded-2xl shadow-xl p-8 relative transition-all ${
                  plan.popular ? 'border-4 border-green-500 lg:scale-105 lg:-mt-4' : 'border border-gray-200'
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-5 left-1/2 -translate-x-1/2 bg-gradient-to-r from-green-500 to-emerald-600 text-white px-6 py-2 rounded-full text-sm font-bold shadow-lg">
                    🔥 MAIS POPULAR
                  </div>
                )}
                <div className="text-center mb-6">
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">{plan.name}</h3>
                  <p className="text-sm text-gray-600 mb-4 h-5">{plan.subtitle}</p>
                  <div className="mb-2">
                    <span className="text-5xl font-bold text-gray-900">{plan.price}</span>
                    <span className="text-gray-600 text-lg">/mês</span>
                  </div>
                </div>
                <ul className="space-y-4 mb-8">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-start">
                      <Check className="w-5 h-5 text-green-500 mr-3 flex-shrink-0 mt-0.5" />
                      <span className="text-gray-700 text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={plan.buttonAction}
                  className={`w-full py-4 rounded-lg font-semibold transition text-lg shadow-md ${
                    plan.popular
                      ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:from-green-600 hover:to-emerald-700 shadow-green-200'
                      : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                  }`}
                >
                  {plan.buttonText}
                </button>
              </div>
            ))}
          </div>
          <div className="text-center">
            <p className="text-gray-600 text-lg">
              <Shield className="w-5 h-5 inline mr-2 text-green-600" />
              Todos os planos incluem 7 dias grátis • Sem compromisso • Cancele quando quiser
            </p>
          </div>
        </div>
      </section>

      {/* Social Proof Section */}
      <section className="py-16 sm:py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <Award className="w-16 h-16 text-green-600 mx-auto mb-6" />
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Negócios locais já estão organizando suas vendas com o VendaFlow
            </h2>
            <p className="text-lg sm:text-xl text-gray-600 max-w-3xl mx-auto mb-8">
              Açaiterias, lanchonetes, cafeterias e outros comércios usam o VendaFlow todos os dias para vender mais e ter controle total do negócio.
            </p>
            <div className="grid sm:grid-cols-3 gap-8 max-w-4xl mx-auto mt-12">
              <div className="bg-gray-50 p-6 rounded-xl border border-gray-200">
                <div className="text-4xl font-bold text-green-600 mb-2">Simples</div>
                <p className="text-gray-600">Interface intuitiva que qualquer um consegue usar</p>
              </div>
              <div className="bg-gray-50 p-6 rounded-xl border border-gray-200">
                <div className="text-4xl font-bold text-green-600 mb-2">Rápido</div>
                <p className="text-gray-600">Venda em segundos, não em minutos</p>
              </div>
              <div className="bg-gray-50 p-6 rounded-xl border border-gray-200">
                <div className="text-4xl font-bold text-green-600 mb-2">Completo</div>
                <p className="text-gray-600">Tudo que você precisa em um lugar só</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-16 sm:py-20 bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Perguntas frequentes
            </h2>
            <p className="text-lg sm:text-xl text-gray-600">
              Tudo que você precisa saber antes de começar
            </p>
          </div>
          <div className="space-y-4">
            {faqs.map((faq, index) => (
              <div key={index} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <button
                  onClick={() => setOpenFAQ(openFAQ === index ? null : index)}
                  className="w-full px-6 py-5 text-left flex items-center justify-between hover:bg-gray-50 transition"
                >
                  <span className="font-semibold text-gray-900 text-lg pr-4">{faq.question}</span>
                  <ChevronDown className={`w-5 h-5 text-gray-600 flex-shrink-0 transition-transform ${openFAQ === index ? 'rotate-180' : ''}`} />
                </button>
                {openFAQ === index && (
                  <div className="px-6 pb-5 text-gray-600 border-t border-gray-100 pt-4">
                    {faq.answer}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="py-20 sm:py-24 bg-gradient-to-r from-green-500 to-emerald-600 relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjEiIHN0cm9rZS13aWR0aD0iMSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0idXJsKCNncmlkKSIvPjwvc3ZnPg==')] opacity-30"></div>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <h2 className="text-4xl sm:text-5xl font-bold text-white mb-6">
            Comece hoje e organize seu negócio
          </h2>
          <p className="text-xl sm:text-2xl text-green-50 mb-10 max-w-2xl mx-auto">
            Teste grátis, sem complicação, e veja como é fácil vender com mais controle.
          </p>
          <button
            onClick={() => {
              trackEvent('cta_final_click');
              trackEvent('start_trial_click');
              navigate('/register');
            }}
            className="bg-white text-green-600 px-10 py-5 rounded-lg font-bold text-xl hover:bg-gray-50 transition shadow-2xl inline-flex items-center group"
          >
            Começar teste grátis agora
            <ArrowRight className="w-6 h-6 ml-3 group-hover:translate-x-1 transition-transform" />
          </button>
          <p className="mt-6 text-green-50 text-sm flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4">
            <span className="flex items-center gap-2">
              <Check className="w-4 h-4" />
              7 dias grátis
            </span>
            <span className="flex items-center gap-2">
              <Check className="w-4 h-4" />
              Sem cartão de crédito
            </span>
            <span className="flex items-center gap-2">
              <Check className="w-4 h-4" />
              Cancele quando quiser
            </span>
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center text-center">
            <div className="flex items-center space-x-2 mb-6">
              <div className="bg-gradient-to-r from-green-500 to-green-600 p-2 rounded-lg">
                <Store className="w-6 h-6 text-white" />
              </div>
              <span className="text-xl font-bold">VendaFlow</span>
            </div>
            <p className="text-gray-400 mb-6 max-w-md">
              Controle total das suas vendas, sem complicação.
            </p>
            <div className="flex gap-6 mb-6 text-sm">
              <button onClick={() => navigate('/login')} className="text-gray-400 hover:text-white transition">
                Entrar
              </button>
              <button onClick={() => navigate('/register')} className="text-gray-400 hover:text-white transition">
                Criar conta
              </button>
              <button onClick={() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })} className="text-gray-400 hover:text-white transition">
                Planos
              </button>
            </div>
            <p className="text-gray-500 text-sm">
              © 2024 VendaFlow. Todos os direitos reservados.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
