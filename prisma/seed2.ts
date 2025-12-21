import { Company, DataInserctionUni, Projeto } from '@core/interfaces';
import { Genero, PrismaClient } from '@prisma/client';
import * as readline from 'readline';
import utilities2 from '../core/utils/utilities2';
import * as path from 'path';

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

const messageConfirmation = (message: string, idProject: string, idCompany: string, remNumber: string, tipo: string | null, companys: Company[], fileNames: any[]) => {
    console.log(``);
    console.log(message);
    console.log(``);
    const p = fileNames.find((p) => p.id === parseInt(idProject, 10));
    console.log(`PROJETO: ${String(p.id).padStart(2, '0')} - ${p.nome}`);
    const c = companys.find((c) => c.id === parseInt(idCompany, 10));
    console.log(`EMPRESA: ${String(c.id).padStart(2, '0')} - ${c.nome}`);
    console.log(`REMESSA: ${remNumber}`);
    console.log(`   TIPO: ${tipo ? tipo : 'PEDIDO NORMAL'}`);
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
                            //createdAt: "2025-09-15T12:00:00.000Z", 
                            //updatedAt: "2025-09-15T12:00:00.000Z",
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

        const nameFiles = await prisma.$queryRaw<
            {
                id: number;
                nome: string;
                ultimaRemessa: number;
                proximaRemessa: number;
            }[]
        >`
            SELECT
            p.id,
            p.nome,
            COALESCE(MAX(g.remessa), 0)                       AS "ultimaRemessa",
            COALESCE(MAX(g.remessa), 0) + 1                   AS "proximaRemessa"
            FROM "Projeto" p
            LEFT JOIN "Escola" e ON e."projetoId" = p.id
            LEFT JOIN "Grade" g ON g."escolaId" = e.id
            GROUP BY p.id
            ORDER BY p.nome;
            `;

        console.log('');
        nameFiles.forEach((proj) => {
            console.log(`Digite ${String(proj.id).padStart(2, ' ')} para: ${proj.nome}`.toUpperCase())
        });
        console.log('');

        while (true) {
            nameFile = await askQuestionNameFile(
                'Informe o ID do projeto para o qual deseja inserir pedidos (INFORME CANCEL PARA SAIR): '.toUpperCase()
            );

            if (nameFile.toUpperCase() === 'CANCEL') {
                console.clear();
                console.log('Inserção abortada pelo usuário.'.toUpperCase());
                return;
            }

            const id = Number(nameFile);

            if (!Number.isInteger(id)) {
                console.log('ID inválido. Informe um número inteiro válido.'.toUpperCase());
                continue;
            }

            if (!nameFiles.some(proj => proj.id === id)) {
                console.log('Projeto não encontrado. Informe um ID listado acima.'.toUpperCase());
                continue;
            }
            break;
        }

        let tipo: string | null = null;

        while (true) {
            const resposta = await askQuestionTipo('Informe o tipo da grade (R = REPOSIÇÃO, N = NULO, ou CANCEL para sair): '.toUpperCase());

            const respostaUpper = resposta.trim().toUpperCase();

            if (respostaUpper === 'CANCEL') {
                console.clear();
                console.log('Inserção abortada pelo usuário.'.toUpperCase());
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

            console.log('Entrada inválida. Digite apenas R, N ou CANCEL.'.toUpperCase());
        }

        const ps = nameFiles.find(p => p.id === Number(nameFile));

        if (!ps) {
            console.log('Projeto não encontrado.'.toUpperCase());
            return;
        }

        let remessa = '';

        while (true) {
            console.log('');

            const isReposicao = Boolean(tipo);
            const valorEsperado = isReposicao ? ps.ultimaRemessa : ps.proximaRemessa;

            console.log(
                `${isReposicao ? 'Última' : 'Próxima'} remessa: ${String(valorEsperado).padStart(2, ' ')}`.toUpperCase()
            );

            remessa = await askQuestionRemessa(
                (
                    isReposicao
                        ? 'Informe a remessa desta reposição, valor deve ser maior que 0 e menor ou igual à (última remessa) mostrada acima'
                        : 'Informe a remessa do pedido, valor deve ser igual à (próxima remessa) mostrada acima'
                ).toUpperCase() + ' (INFORME CANCEL PARA SAIR): '
            );

            if (remessa.trim().toUpperCase() === 'CANCEL') {
                console.clear();
                console.log('Inserção abortada pelo usuário.'.toUpperCase());
                return;
            }

            const numero = Number(remessa);

            const valido = isReposicao
                ? Number.isInteger(numero) && numero > 0 && numero <= ps.ultimaRemessa
                : Number.isInteger(numero) && numero === ps.proximaRemessa;

            if (valido) {
                break;
            }

            console.log(
                (
                    isReposicao
                        ? 'Valor inválido. Digite um número maior que 0 e menor ou igual à última remessa.'
                        : 'Valor inválido. Digite exatamente o número da próxima remessa.'
                ).toUpperCase()
            );
        }

        let company = '';

        const companys = await prisma.company.findMany();

        console.log('');
        companys.forEach(comp => {
            console.log(
                `Digite ${String(comp.id).padStart(2, ' ')} para: ${comp.nome}`.toUpperCase()
            );
        });
        console.log('');

        while (true) {
            company = await askQuestionCompanyId(
                'Informe o identificador da empresa, maior que 0 (INFORME CANCEL PARA SAIR): '.toUpperCase()
            );

            const valor = company.trim().toUpperCase();

            if (valor === 'CANCEL') {
                console.clear();
                console.log('Inserção abortada pelo usuário.'.toUpperCase());
                return;
            }

            const companyId = Number(valor);

            if (!Number.isInteger(companyId) || companyId <= 0) {
                console.log('Valor inválido. Informe um número inteiro maior que 0.'.toUpperCase());
                continue;
            }

            const existe = companys.some(comp => comp.id === companyId);

            if (!existe) {
                console.log('Empresa não encontrada. Informe um ID listado acima.'.toUpperCase());
                continue;
            }           
            break;
        }

        let filename = '';
        let filePath = '';

        if (nameFile) {
            console.log(`path: ${path}`)
            const baseDir = path.join(process.cwd(), 'core', 'utils', 'docs_proj_p');
            filename = `distgradeunificada${nameFile.toUpperCase()}.xlsx`;
            filePath = path.join(baseDir, filename);
        }

        //const pathFile = nameFile ? String(`core/utils/distgradeunificada${nameFile}.xlsx`) : String(`core/utils/distgradeunificada.xlsx`);

        const dados = utilities2(filePath);

        const mess = 'RESUMO DOS DADOS INFORMADOS PARA INSERÇÃO NO BANCO DE DADOS:';

        messageConfirmation(mess, nameFile.toUpperCase(), company, remessa, tipo, companys, nameFiles);

        const confirmation = await askQuestion(`Você deseja iniciar a inserção de grades do projeto listado acima no BD? (Y/N)`.toUpperCase());

        if (confirmation !== 'Y') {
            console.clear();
            console.log('Inserção abortada pelo usuário.'.toUpperCase());
            return; // Sai da função se o usuário não quiser continuar
        }

        await inserirDadosNoBanco(dados, parseInt(remessa, 10), parseInt(company, 10), tipo);

    } catch (error) {
        console.error('Erro ao executar o seed:'.toUpperCase(), error);
    } finally {
        await prisma.$disconnect();
    }
}

seed2();
