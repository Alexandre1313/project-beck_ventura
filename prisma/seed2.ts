import { DataInserctionUni } from '@core/interfaces';
import { Genero, PrismaClient } from '@prisma/client';
import * as readline from 'readline';
import utilities2 from '../core/utils/utilities2';

const prisma = new PrismaClient();

// Função para perguntar ao usuário
const askQuestion = (question) => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise((resolve) => rl.question(question, (answer) => {
        rl.close();
        resolve(answer.toUpperCase()); // Converte a resposta para maiúsculas
    }));
};

const askQuestionNameFile = (question: string): Promise<string> => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise<string>((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve((answer ?? '').trim());
        });
    });
};

const askQuestionRemessa = (question: string): Promise<string> => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise<string>((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.trim()); // Sempre retorna a string digitada
        });
    });
};

const askQuestionTipo = (question: string): Promise<string> => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise<string>((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve((answer ?? '').trim());
        });
    });
};

const askQuestionCompanyId = (question: string): Promise<string> => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise<string>((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve((answer ?? '').trim());
        });
    });
};

const messageConfirmation = (message: string, nameProject: string, idCompany: string, remNumber: string, tipo: string | null) => {
    console.log(``);
    console.log(message);
    console.log(``);
    console.log(`Projeto: ${nameProject}`);
    console.log(`Empresa: ${idCompany}`);
    console.log(`Remessa: ${remNumber}`);
    console.log(`   Tipo: ${tipo}`);
    console.log(``);
}

async function seed2() {
    try {
        async function inserirDadosNoBanco(dados: DataInserctionUni[], remessa: number, companyId: number, tipo: string | null) {
            let barcodeCounter = 0;

            const lastBarcode = await prisma.barcode.findFirst({
                orderBy: { codigo: 'desc' },
            });

            if (lastBarcode) {
                barcodeCounter = parseInt(lastBarcode.codigo, 10) + 1;
            }

            console.log('Iniciando a inserção de dados...');

            for (const dado of dados) {
                console.log(`\nVerificando ou criando projeto: ${dado.projeto}`);
                const projeto = await prisma.projeto.upsert({
                    where: { nome: dado.projeto },
                    update: {},
                    create: { nome: dado.projeto, descricao: `UNIFORMES DE ${dado.projeto}` },
                });
                console.log(`Projeto ${projeto.nome} (ID: ${projeto.id}) processado.`);

                for (const escolaData of dado.escolas) {
                    console.log(`\nVerificando ou criando escola: ${escolaData.nome}`);
                    const escola = await prisma.escola.upsert({
                        where: {
                            projetoId_nome: { projetoId: projeto.id, nome: escolaData.nome },
                        },
                        update: { numberJoin: escolaData.numberJoin, },
                        create: {
                            numeroEscola: escolaData.numeroEscola,
                            nome: escolaData.nome,
                            numberJoin: escolaData.numberJoin,
                            projetoId: projeto.id,
                        },
                    });

                    console.log(`Escola ${escola.nome} (ID: ${escola.id}) processada.`);

                    console.log(`\nCriando grade para a escola ${escola.nome}`);

                    const grade = await prisma.grade.create({
                        data: {
                            remessa: remessa,
                            escolaId: escola.id,
                            companyId: companyId,
                            //createdAt: "2025-02-17T11:39:00.739Z", 
                            //updatedAt: "2025-02-17T11:39:00.739Z",
                            tipo: tipo || null,
                        },
                    });

                    console.log(`Grade (ID: ${grade.id}) criada.`);

                    for (const itemData of escolaData.itens) {
                        console.log(`\nVerificando ou criando item: ${itemData.nome}`);
                        const item = await prisma.item.upsert({
                            where: {
                                nome_projetoId_genero: {
                                    nome: itemData.nome,
                                    projetoId: projeto.id,
                                    genero: itemData.genero as Genero,
                                },
                            },
                            update: {},
                            create: {
                                nome: itemData.nome,
                                genero: itemData.genero as Genero,
                                projetoId: projeto.id,
                            },
                        });
                        console.log(`Item ${item.nome} (ID: ${item.id}) processado.`);

                        for (const tamanhoQtd of itemData.tamanhos) {
                            console.log(`\nVerificando ou criando tamanho: ${tamanhoQtd.tamanho}`);
                            const tamanho = await prisma.tamanho.upsert({
                                where: { nome: String(tamanhoQtd.tamanho) },
                                update: {},
                                create: { nome: String(tamanhoQtd.tamanho) },
                            });
                            console.log(`Tamanho ${tamanho.nome} (ID: ${tamanho.id}) processado.`);

                            console.log(`\nVerificando ou criando itemTamanho para item ${item.nome} e tamanho ${tamanho.nome}`);
                            let itemTamanho = await prisma.itemTamanho.findUnique({
                                where: { itemId_tamanhoId: { itemId: item.id, tamanhoId: tamanho.id } },
                            });

                            if (!itemTamanho) {
                                itemTamanho = await prisma.itemTamanho.create({
                                    data: {
                                        itemId: item.id,
                                        tamanhoId: tamanho.id,
                                    },
                                });
                                console.log(`ItemTamanho criado com ID: ${itemTamanho.id}`);

                                const barcode = String(barcodeCounter).padStart(5, '0');
                                barcodeCounter = (barcodeCounter + 1) % 100000;

                                await prisma.barcode.create({
                                    data: {
                                        codigo: barcode,
                                        itemTamanhoId: itemTamanho.id,
                                    },
                                });
                                console.log(`Barcode ${barcode} criado para ItemTamanho ID: ${itemTamanho.id}`);

                                await prisma.estoque.create({
                                    data: {
                                        itemTamanhoId: itemTamanho.id,
                                        quantidade: 0,
                                    },
                                });
                                console.log(`Estoque criado para ItemTamanho ID: ${itemTamanho.id}`);
                            } else {
                                console.log(`ItemTamanho já existe com ID: ${itemTamanho.id}`);
                            }

                            console.log(`\nCriando GradeItem para Grade ID: ${grade.id} e ItemTamanho ID: ${itemTamanho.id}`);
                            await prisma.gradeItem.create({
                                data: {
                                    gradeId: grade.id,
                                    itemTamanhoId: itemTamanho.id,
                                    quantidade: tamanhoQtd.quantidade,
                                    quantidadeExpedida: 0,
                                },
                            });
                            console.log(`GradeItem criado para Grade ID: ${grade.id}`);
                        }
                    }
                    console.clear();
                }
            }
            console.log('Inserção de dados concluída!');
        }

        let nameFile = '';

        while (nameFile === '') {
            nameFile = await askQuestionNameFile('Informe o nome do projeto para o qual deseja inserir pedidos (INFORME CANCEL PARA SAIR): ');
            if (nameFile.toUpperCase() === 'CANCEL') {
                console.clear();
                console.log('Inserção abortada pelo usuário.');
                return; // Sai da função se o usuário não quiser continuar
            }
        }

        let remessa: string = '';

        while (true) {
            remessa = await askQuestionRemessa('Informe a remessa do pedido, valores maior que 0 (INFORME CANCEL PARA SAIR): ');

            if (remessa.toUpperCase() === 'CANCEL') {
                console.clear();
                console.log('Inserção abortada pelo usuário.');
                return;
            }

            const numero = parseInt(remessa, 10);

            if (!isNaN(numero) && numero > 0) {
                // número válido, sai do loop
                break;
            }

            console.log('Valor inválido. Digite um número maior que 0.');
        }

        let tipo: string | null = null;

        while (true) {
            const resposta = await askQuestionTipo('Informe o tipo da grade (R = REPOSIÇÃO, N = NULO, ou CANCEL para sair): ');

            const respostaUpper = resposta.trim().toUpperCase();

            if (respostaUpper === 'CANCEL') {
                console.clear();
                console.log('Inserção abortada pelo usuário.');
                return;
            }

            if (respostaUpper === 'R') {
                tipo = 'REPOSIÇÃO';
                break;
            }

            if (respostaUpper === 'N') {
                tipo = null;
                break;
            }

            console.log('Entrada inválida. Digite apenas R, N ou CANCEL.');
        }

        let company: string = '';

        while (true) {
            company = await askQuestionCompanyId('Informe o identificador da empresa, maior que 0 (INFORME CANCEL PARA SAIR): ');

            if (company.toUpperCase() === 'CANCEL') {
                console.clear();
                console.log('Inserção abortada pelo usuário.');
                return;
            }

            const companyNumber = parseInt(company, 10);

            if (!isNaN(companyNumber) && companyNumber > 0) {
                break; // válido, sai do loop
            }

            console.log('Valor inválido. Informe um número inteiro maior que 0.');
        }

        const pathFile = nameFile ? String(`core/utils/distgradeunificada${nameFile}.xlsx`) : String(`core/utils/distgradeunificada.xlsx`);

        const dados = utilities2(pathFile);

        const mess = 'RESUMO DOS DADOS INFORMADOS PARA INSERÇÃO NO BANCO DE DADOS:';

        messageConfirmation(mess, nameFile.toUpperCase(), company, remessa, tipo);

        const confirmation = await askQuestion(`Você deseja iniciar a inserção de grades do projeto listado acima no BD? (Y/N)`);

        if (confirmation !== 'Y') {
            console.clear();
            console.log('Inserção abortada pelo usuário.');
            return; // Sai da função se o usuário não quiser continuar
        }

        await inserirDadosNoBanco(dados, parseInt(remessa, 10), parseInt(company, 10), tipo);

    } catch (error) {
        console.error('Erro ao executar o seed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

seed2();
