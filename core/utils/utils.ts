import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import * as os from "os";

export default function convertSPTime(dateString: string): string {
  const timeZone = 'America/Sao_Paulo';
  let date = new Date(dateString);
  if (isNaN(date.getTime())) {
    console.error('Invalid Date:', dateString);
    date = new Date();
  }
  const zonedDate = toZonedTime(date, timeZone);
  return format(zonedDate, 'dd/MM/yyyy HH:mm:ss');
}

export function calcularEstoqueDeKit(componentes: any[]): number {
  if (!componentes || componentes.length === 0) return 0;

  const quantidadesPossiveis = componentes.map((componente) => {
    const estoqueDisponivel = componente.component.estoque?.quantidade ?? 0;
    const quantidadeNecessaria = componente.quantidade || 1;

    // Não pode montar nem 1 se não tiver estoque suficiente ou necessidade inválida
    if (estoqueDisponivel <= 0 || quantidadeNecessaria <= 0) return 0;

    return Math.floor(estoqueDisponivel / quantidadeNecessaria);
  });

  const estoqueValido = quantidadesPossiveis.filter(qtd => qtd >= 0);

  // Se algum componente tiver 0, não pode montar nenhum kit
  if (estoqueValido.includes(0)) return 0;

  return Math.min(...estoqueValido);
}

export const sizes = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'EG', 'EX', 'EGG', 'EXG', 'XGG', 'EXGG', 'G1', 'G2', 'G3', 'EG/LG'];

// Função para ordenar tamanhos
export const sizeOrders = (tamanhos: string[]): string[] => {
  const numTamanhos = tamanhos.filter(tamanho => /^[0-9]+$/.test(tamanho)); // Filtra tamanhos numéricos
  const letraTamanhos = tamanhos.filter(tamanho => !/^[0-9]+$/.test(tamanho)); // Filtra tamanhos com letras

  // Ordena tamanhos numéricos (convertendo para inteiro)
  numTamanhos.sort((a, b) => parseInt(a) - parseInt(b));

  // Ordena tamanhos com letras conforme a ordem desejada
  const ordem = sizes;
  letraTamanhos.sort((a, b) => ordem.indexOf(a) - ordem.indexOf(b));

  return [...numTamanhos, ...letraTamanhos];
};

export const limparString = (str: string): string => {
  return str.replace(/[\n\r\t]+/g, ' ').trim().toUpperCase();
}

export const tratarValor = (valor: any, valorPadrao: string | null = null): string | null => {
  if (valor === undefined || valor === null || String(valor).trim() === "") {
    return valorPadrao;
  }
  return limparString(String(valor));
}

export function getLocalIPv4(): string | null {
  const interfaces = os.networkInterfaces();

  for (const iface of Object.values(interfaces)) {
    for (const config of iface || []) {
      if (config.family === 'IPv4' && !config.internal) {
        return config.address; // <- IP atual da máquina
      }
    }
  }
  return null;
}
