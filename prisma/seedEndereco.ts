import { PrismaClient } from '@prisma/client';
import * as readline from 'readline';
import { EnderecoInserction } from '@core/interfaces';
import utilitiesEndereco from '../core/utils/utilitiesEndereco';
//import * as path from 'path';

const prisma = new PrismaClient();

// Função para perguntar ao usuário
const askQuestion = (question: string) => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toUpperCase()); // Converte a resposta para maiúsculas
    })
  );
};

async function seedEndereco() {
  try {
    async function inserirDadosNoBanco(dados: EnderecoInserction[]) {
      console.log('Iniciando a inserção de dados...');

      for (const dado of dados) {
        // Buscar o projeto
        console.log(`\nVerificando projeto: ${dado.projeto}`);
        const projeto = await prisma.projeto.findUnique({
          where: { nome: dado.projeto },
        });

        if (!projeto) {
          console.log(`Projeto "${dado.projeto}" não encontrado. Encerrando o processo para este conjunto de dados.`);
          return; // Encerra o processo, pois o projeto não existe
        }

        console.log(`Projeto encontrado: ${projeto.nome} (ID: ${projeto.id})`);

        for (const escolaData of dado.escolas) {
          // Buscar a escola vinculada ao projeto
          console.log(`\nVerificando escola: ${escolaData.nome}`);
          const escola = await prisma.escola.findUnique({
            where: {
               id: escolaData.id ,
            },
          });

          if (!escola) {
            console.log(`Escola "${escolaData.nome}" não encontrada no projeto "${projeto.nome}". Pulando para a próxima escola.`);
            continue; // Se a escola não existir, pula para a próxima
          }

          console.log(`Escola encontrada: ${escola.nome} (ID: ${escola.id})`);

          // Criar o endereço e vinculá-lo à escola
          const enderecoCriado = await prisma.addressSchool.create({
            data: {
              street: escolaData.endereco.street,
              number: escolaData.endereco.number,
              complement: escolaData.endereco.complement,
              neighborhood: escolaData.endereco.neighborhood,
              city: escolaData.endereco.city,
              state: escolaData.endereco.state,
              postalCode: escolaData.endereco.postalCode,
              country: escolaData.endereco.country,
              escolaId: escola.id, // Relacionar com a escola
            },
          });
          console.log(`Endereço criado e vinculado à escola "${escola.nome}" (ID: ${enderecoCriado.id})`);

          // Criar o telefone, se houver
          if (escolaData.telefone) {
            const telefoneCriado = await prisma.telephonesSchool.create({
              data: {
                telefone: escolaData.telefone.telefone,
                escolaId: escola.id, // Relacionar com a escola
              },
            });
            console.log(`Telefone criado e vinculado à escola "${escola.nome}" (ID: ${telefoneCriado.id})`);
          } else {
            console.log(`Nenhum telefone informado para a escola "${escola.nome}".`);
          }
        }
      }

      console.log('\nInserção de dados concluída!');
    }

    // Obter dados da planilha
    const dados = utilitiesEndereco();

    // Perguntar ao usuário se deseja continuar
    const confirmation = await askQuestion('Você deseja iniciar a inserção de endereços no BD? (Y/N) ');

    if (confirmation !== 'Y') {
      console.clear();
      console.log('Inserção abortada pelo usuário.');
      return; // Sai da função se o usuário não quiser continuar
    }

    console.clear(); // Limpa o console após a confirmação do usuário

    // Chama a função para inserir os dados no banco
    await inserirDadosNoBanco(dados);

  } catch (error) {
    console.error('Erro ao executar o seed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

seedEndereco();
