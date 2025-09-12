import { EnderecoInserction, AddressSchool, TelephonesSchool } from "@core/interfaces";
import * as XLSX from 'xlsx';
import * as path from 'path';

const baseDir = path.join(process.cwd(), 'core', 'utils', 'docs_proj_end');
const filename = `cadendereco.xlsx`;
const filePath = path.join(baseDir, filename);

export default function utilitiesEndereco(caminhoPlanilha: string = filePath): EnderecoInserction[] {
  // Lê o arquivo Excel
  const workbook = XLSX.readFile(caminhoPlanilha);

  // Pega o nome da primeira aba da planilha
  const sheetName = workbook.SheetNames[0];

  // Filtra as linhas para remover aquelas que são vazias ou não têm dados válidos
  const worksheet = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
  const linhasValidas = worksheet.filter((linha: any[]) => linha.some(celula => celula && celula.trim() !== ""));

  const dadosProcessados: EnderecoInserction[] = [];

  //console.dir(worksheet, { depth: null, maxArrayLength: null });

  // Verifica se a planilha está vazia
  if (linhasValidas.length <= 1) {
    return dadosProcessados;
  }

  function tratarValor(valor: any, valorPadrao: string | null = null): string | null {
    if (valor === undefined || valor === null || String(valor).trim() === "") {
      return valorPadrao;
    }
    return String(valor).toUpperCase().trim();
  }

  // Processa cada linha, ignorando o cabeçalho (índice 0)
  for (let i = 1; i < linhasValidas.length; i++) {

    // Iterando pelas linhas
    const linha = linhasValidas[i];

    const projeto = tratarValor(linha[0]);
    const id = parseInt(tratarValor(linha[1]));
    const numeroEscola = tratarValor(linha[2]);
    const nomeEscola = tratarValor(linha[3]);
    const telefone = tratarValor(linha[4]);
    const street = tratarValor(linha[5]);
    const number = tratarValor(linha[6]);
    const complement = tratarValor(linha[7]);
    const neighborhood = tratarValor(linha[8]);
    const postalCode = tratarValor(linha[9]);
    const city = tratarValor(linha[10], null); // Se vazio, será null
    const state = tratarValor(linha[11]);
    const country = tratarValor(linha[12], "BRASIL"); // Default: "BRASIL"

    // Cria os objetos conforme as interfaces
    const endereco: AddressSchool = {
      street,
      number,
      complement,
      neighborhood,
      city,
      state,
      postalCode,
      country,
    };

    const telefoneObj: TelephonesSchool | null = telefone
      ? { telefone }
      : null;

    // Verifica se o projeto já existe
    let projetoExistente = dadosProcessados.find(p => p.projeto === projeto);

    if (!projetoExistente) {
      projetoExistente = {
        projeto,
        escolas: [],
      };
      dadosProcessados.push(projetoExistente);
    }

    if (street) {
      // Adiciona a escola no projeto
      projetoExistente.escolas.push({
        id: id,
        nome: nomeEscola,
        numeroEscola,
        endereco,
        telefone: telefoneObj,
      });
    }
  }

  console.dir(dadosProcessados, { depth: null, maxArrayLength: null });
  return dadosProcessados;
}
