-- CreateEnum
CREATE TYPE "Genero" AS ENUM ('MASCULINO', 'FEMININO', 'UNISSEX');

-- CreateTable
CREATE TABLE "Usuarios" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Projeto" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "url" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Projeto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Escola" (
    "id" SERIAL NOT NULL,
    "numeroEscola" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "projetoId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Escola_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Item" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "genero" "Genero" NOT NULL,
    "projetoId" INTEGER NOT NULL,
    "url" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tamanho" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tamanho_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemTamanho" (
    "id" SERIAL NOT NULL,
    "itemId" INTEGER NOT NULL,
    "tamanhoId" INTEGER NOT NULL,
    "url" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemTamanho_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Barcode" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "itemTamanhoId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Barcode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Estoque" (
    "id" SERIAL NOT NULL,
    "itemTamanhoId" INTEGER NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Estoque_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Grade" (
    "id" SERIAL NOT NULL,
    "escolaId" INTEGER NOT NULL,
    "finalizada" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Grade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Caixa" (
    "id" SERIAL NOT NULL,
    "gradeId" INTEGER NOT NULL,
    "escolaCaixa" TEXT NOT NULL,
    "escolaNumber" TEXT NOT NULL,
    "projeto" TEXT NOT NULL,
    "qtyCaixa" INTEGER NOT NULL,
    "caixaNumber" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Caixa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaixaItem" (
    "id" SERIAL NOT NULL,
    "caixaId" INTEGER NOT NULL,
    "itemName" TEXT NOT NULL,
    "itemGenero" TEXT NOT NULL,
    "itemTam" TEXT NOT NULL,
    "itemQty" INTEGER NOT NULL,
    "itemTamanhoId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaixaItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GradeItem" (
    "id" SERIAL NOT NULL,
    "gradeId" INTEGER NOT NULL,
    "itemTamanhoId" INTEGER NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "quantidadeExpedida" INTEGER NOT NULL,
    "qtyPCaixa" INTEGER NOT NULL DEFAULT 0,
    "isCount" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GradeItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Embalagem" (
    "id" SERIAL NOT NULL,
    "nome" VARCHAR(200) NOT NULL,
    "email" TEXT NOT NULL,
    "nomefantasia" VARCHAR(200),
    "telefone" VARCHAR(15),
    "whats" VARCHAR(15) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Embalagem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntryInput" (
    "id" SERIAL NOT NULL,
    "embalagemId" INTEGER NOT NULL,
    "itemTamanhoId" INTEGER NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EntryInput_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutInput" (
    "id" SERIAL NOT NULL,
    "itemTamanhoId" INTEGER NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutInput_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuarios_email_key" ON "Usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Projeto_nome_key" ON "Projeto"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "Escola_projetoId_nome_key" ON "Escola"("projetoId", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "Item_nome_projetoId_genero_key" ON "Item"("nome", "projetoId", "genero");

-- CreateIndex
CREATE UNIQUE INDEX "Tamanho_nome_key" ON "Tamanho"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "ItemTamanho_itemId_tamanhoId_key" ON "ItemTamanho"("itemId", "tamanhoId");

-- CreateIndex
CREATE UNIQUE INDEX "Barcode_codigo_key" ON "Barcode"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Barcode_itemTamanhoId_key" ON "Barcode"("itemTamanhoId");

-- CreateIndex
CREATE UNIQUE INDEX "Estoque_itemTamanhoId_key" ON "Estoque"("itemTamanhoId");

-- CreateIndex
CREATE UNIQUE INDEX "Caixa_gradeId_caixaNumber_key" ON "Caixa"("gradeId", "caixaNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Embalagem_nome_key" ON "Embalagem"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "Embalagem_email_key" ON "Embalagem"("email");

-- AddForeignKey
ALTER TABLE "Escola" ADD CONSTRAINT "Escola_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "Projeto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "Projeto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemTamanho" ADD CONSTRAINT "ItemTamanho_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemTamanho" ADD CONSTRAINT "ItemTamanho_tamanhoId_fkey" FOREIGN KEY ("tamanhoId") REFERENCES "Tamanho"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Barcode" ADD CONSTRAINT "Barcode_itemTamanhoId_fkey" FOREIGN KEY ("itemTamanhoId") REFERENCES "ItemTamanho"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estoque" ADD CONSTRAINT "Estoque_itemTamanhoId_fkey" FOREIGN KEY ("itemTamanhoId") REFERENCES "ItemTamanho"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grade" ADD CONSTRAINT "Grade_escolaId_fkey" FOREIGN KEY ("escolaId") REFERENCES "Escola"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Caixa" ADD CONSTRAINT "Caixa_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "Grade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaixaItem" ADD CONSTRAINT "CaixaItem_caixaId_fkey" FOREIGN KEY ("caixaId") REFERENCES "Caixa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeItem" ADD CONSTRAINT "GradeItem_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "Grade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeItem" ADD CONSTRAINT "GradeItem_itemTamanhoId_fkey" FOREIGN KEY ("itemTamanhoId") REFERENCES "ItemTamanho"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntryInput" ADD CONSTRAINT "EntryInput_embalagemId_fkey" FOREIGN KEY ("embalagemId") REFERENCES "Embalagem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntryInput" ADD CONSTRAINT "EntryInput_itemTamanhoId_fkey" FOREIGN KEY ("itemTamanhoId") REFERENCES "ItemTamanho"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutInput" ADD CONSTRAINT "OutInput_itemTamanhoId_fkey" FOREIGN KEY ("itemTamanhoId") REFERENCES "ItemTamanho"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
